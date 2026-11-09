'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { OrderDto, ProductDto, QuoteDto } from '@goober/contracts';
import { formatMoney } from '@goober/contracts';
import { api } from './api';
import { Empty, ErrorNotice, Loading, PageTitle, useResource } from './shared';
import { useCart, useCurrency } from './currency';
import { ProductBrandArt } from './product-brand-art';

export function Cart() {
  const [currency] = useCurrency();
  const { ids, remove, clear } = useCart();
  const { data: catalog, loading, error } = useResource<ProductDto[]>('/products?currency=' + currency, { private: false });
  const [pending, setPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const items = (catalog ?? []).filter(p => ids.includes(p.id));
  const totalMinor = items.reduce((sum, item) => sum + BigInt(item.priceMinor), 0n).toString();

  async function payWithPaystack() {
    if (!items.length || pending) return;
    setPending(true);
    setCheckoutError('');
    try {
      if (items.length === 1) {
        const res = await api<import('@goober/contracts').DirectCheckoutDto>(
          '/checkout',
          { productId: items[0]!.id, quantity: 1, currency, paymentMethod: 'paystack', callbackUrl: window.location.origin + '/checkout/verify' },
          { 'Idempotency-Key': crypto.randomUUID() },
        );
        if (res.paystack?.authorizationUrl) {
          remove(items[0]!.id);
          window.location.assign(res.paystack.authorizationUrl);
          return;
        }
      }
      const minMinor = currency === 'NGN' ? 10000n : 100n;
      const chargeMinor = BigInt(totalMinor) < minMinor ? minMinor : BigInt(totalMinor);
      const funded = await api<import('@goober/contracts').FundingDto>(
        '/wallet/fund/paystack/initialize',
        { amountMinor: chargeMinor.toString(), currency, callbackUrl: window.location.origin + '/checkout/verify' },
      );
      if (funded.authorizationUrl) {
        window.location.assign(funded.authorizationUrl);
      }
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Unable to initialize Paystack checkout.');
      setPending(false);
    }
  }

  async function checkoutCart() {
    if (!items.length || pending) return;
    setPending(true);
    setCheckoutError('');
    try {
      let lastOrder: OrderDto | null = null;
      for (const item of items) {
        const quote = await api<QuoteDto>('/quotes', { productId: item.id, quantity: 1, currency });
        lastOrder = await api<OrderDto>('/orders', { quoteId: quote.id, currency }, { 'Idempotency-Key': crypto.randomUUID() });
        remove(item.id);
      }
      if (lastOrder) {
        window.location.assign('/orders/' + encodeURIComponent(lastOrder.id));
      }
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : 'Unable to complete checkout.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="SHOPPING CART"
        title="Your selected products."
        description={`Review fixed-price items in ${currency} (${currency === 'USD' ? '$' : '₦'}) before placing your order.`}
      />
      <ErrorNotice message={error || checkoutError} />
      {loading ? (
        <Loading label="Loading cart items…" />
      ) : items.length ? (
        <div className="account-grid">
          <section className="record-list" aria-label="Cart items">
            {items.map(item => (
              <article className="order-row" key={item.id}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <ProductBrandArt name={item.name} category={item.category} provider={item.provider} variant="compact" />
                  <div>
                    <span className="tag">{item.category}</span>
                    <h3>
                      <Link href={'/products/' + encodeURIComponent(item.id)}>{item.name}</Link>
                    </h3>
                    <p>{item.description}</p>
                  </div>
                </div>
                <div className="order-summary">
                  <strong className="price" data-testid={`cart-price-${item.id}`}>
                    {formatMoney(item.priceMinor, item.currency)} ({item.currency})
                  </strong>
                  <button type="button" className="button secondary small" onClick={() => remove(item.id)}>
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </section>
          <aside className="panel" aria-label="Cart summary">
            <h2>Order summary</h2>
            <dl className="detail-list">
              <div>
                <dt>Selected currency</dt>
                <dd>{currency} ({currency === 'USD' ? '$' : '₦'})</dd>
              </div>
              <div>
                <dt>Items</dt>
                <dd>{items.length}</dd>
              </div>
              <div>
                <dt>Total payable ({currency})</dt>
                <dd data-testid="cart-total">{formatMoney(totalMinor, currency)}</dd>
              </div>
            </dl>
            <button type="button" className="button full-width" disabled={pending} onClick={() => void payWithPaystack()}>
              {pending ? 'Processing…' : `Pay with Paystack (${formatMoney(totalMinor, currency)})`}
            </button>
            <button type="button" className="button secondary full-width" disabled={pending} onClick={() => void checkoutCart()}>
              {pending ? 'Processing checkout…' : `Pay with ${currency} balance (${formatMoney(totalMinor, currency)})`}
            </button>
            <button type="button" className="button secondary small" disabled={pending} onClick={clear}>
              Clear cart
            </button>
            <p className="fine-print">
              Payable amounts are calculated and validated on the server in {currency}.
            </p>
          </aside>
        </div>
      ) : (
        <Empty title="Your cart is empty.">
          <p>Browse the catalog to add digital tools and services.</p>
          <Link className="text-link" href="/#catalog">
            Browse the store →
          </Link>
        </Empty>
      )}
    </>
  );
}

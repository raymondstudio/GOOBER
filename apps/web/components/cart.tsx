'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { MeDto, OrderDto, ProductDto, QuoteDto } from '@goober/contracts';
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
      const me = await api<MeDto>('/me').catch(() => null);
      if (!me) {
        window.location.assign('/sign-in?redirect=' + encodeURIComponent('/cart'));
        return;
      }
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
      if ((e as { status?: number }).status === 401 || (e instanceof Error && e.message.toLowerCase().includes('sign in'))) {
        window.location.assign('/sign-in?redirect=' + encodeURIComponent('/cart'));
        return;
      }
      setCheckoutError(e instanceof Error ? e.message : 'Unable to initialize Paystack checkout.');
      setPending(false);
    }
  }

  async function checkoutCart() {
    if (!items.length || pending) return;
    setPending(true);
    setCheckoutError('');
    try {
      const me = await api<MeDto>('/me').catch(() => null);
      if (!me) {
        window.location.assign('/sign-in?redirect=' + encodeURIComponent('/cart'));
        return;
      }
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
      if ((e as { status?: number }).status === 401 || (e instanceof Error && e.message.toLowerCase().includes('sign in'))) {
        window.location.assign('/sign-in?redirect=' + encodeURIComponent('/cart'));
        return;
      }
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
        <div className="account-grid cart-layout">
          <section className="record-list cart-items-list" aria-label="Cart items">
            <div className="cart-list-header">
              <span className="cart-list-count">Cart items ({items.length})</span>
              <button type="button" className="button secondary small clear-cart-btn" disabled={pending} onClick={clear}>
                Clear cart
              </button>
            </div>
            {items.map(item => (
              <article className="order-row cart-item-row" key={item.id}>
                <div className="cart-item-main">
                  <ProductBrandArt name={item.name} category={item.category} provider={item.provider} variant="compact" />
                  <div className="cart-item-details">
                    <div className="cart-item-meta">
                      <span className="tag">{item.category}</span>
                      <span className="cart-item-provider">{item.provider}</span>
                    </div>
                    <h3 className="cart-item-title">
                      <Link href={'/products/' + encodeURIComponent(item.id)}>{item.name}</Link>
                    </h3>
                    <p className="cart-item-desc">{item.description}</p>
                  </div>
                </div>
                <div className="order-summary cart-item-summary">
                  <strong className="price" data-testid={`cart-price-${item.id}`}>
                    {formatMoney(item.priceMinor, item.currency)} ({item.currency})
                  </strong>
                  <button
                    type="button"
                    className="cart-remove-btn"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.name} from cart`}
                    title="Remove item"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              </article>
            ))}
          </section>
          <aside className="panel cart-summary-panel" aria-label="Cart summary">
            <h2 className="cart-summary-title">Order summary</h2>
            <dl className="detail-list cart-detail-list">
              <div>
                <dt>Selected currency</dt>
                <dd>{currency} ({currency === 'USD' ? '$' : '₦'})</dd>
              </div>
              <div>
                <dt>Total items</dt>
                <dd>{items.length}</dd>
              </div>
              <div className="cart-total-row">
                <dt>Total payable</dt>
                <dd data-testid="cart-total" className="cart-total-amount">{formatMoney(totalMinor, currency)}</dd>
              </div>
            </dl>
            <div className="cart-summary-actions">
              <button type="button" className="button full-width" disabled={pending} onClick={() => void payWithPaystack()}>
                {pending ? 'Processing…' : `Pay with Paystack (${formatMoney(totalMinor, currency)})`}
              </button>
              <button type="button" className="button secondary full-width" disabled={pending} onClick={() => void checkoutCart()}>
                {pending ? 'Processing checkout…' : `Pay with ${currency} balance (${formatMoney(totalMinor, currency)})`}
              </button>
            </div>
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

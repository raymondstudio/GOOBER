'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {ProductDto,QuoteDto,OrderDto,DirectCheckoutDto} from '@goober/contracts';
import {formatMoney} from '@goober/contracts';
import {api} from './api';
import {DateLabel,ErrorNotice,Loading,useResource} from './shared';
import {useCart,useCurrency} from './currency';
import {ProductBrandArt} from './product-brand-art';

export function ProductDetail({id}:{id:string}) {
  const [currency] = useCurrency();
  const {ids:cartIds,add:addToCart} = useCart();
  const endpoint = currency === 'USD' ? '/products/'+encodeURIComponent(id)+'?currency=USD' : '/products/'+encodeURIComponent(id);
  const {data:product,loading,refreshing,error,refresh} = useResource<ProductDto>(endpoint,{private:false});
  const [quote,setQuote] = useState<QuoteDto|null>(null);
  const [pending,setPending] = useState('');
  const [failure,setFailure] = useState('');
  const [now,setNow] = useState(Date.now());
  const key = useRef('');
  useEffect(() => {
    setQuote(q => (q && q.currency !== currency ? null : q));
  },[currency]);
  useEffect(() => {
    if(!quote) return;
    const interval = setInterval(() => setNow(Date.now()),1000);
    return () => clearInterval(interval);
  },[quote]);
  async function buyDirect(paymentMethod:'paystack'|'wallet') {
    setPending(paymentMethod); setFailure('');
    try {
      const result = await api<DirectCheckoutDto>(
        '/checkout',
        {productId:id,quantity:1,currency,paymentMethod,callbackUrl:window.location.origin+'/checkout/verify'},
        {'Idempotency-Key':crypto.randomUUID()},
      );
      if(paymentMethod === 'paystack' && result.paystack?.authorizationUrl) {
        window.location.assign(result.paystack.authorizationUrl);
        return;
      }
      if(result.order?.id) {
        window.location.assign('/orders/'+encodeURIComponent(result.order.id));
      }
    } catch(e) { setFailure(e instanceof Error ? e.message : 'Unable to complete checkout.'); setPending(''); }
  }
  async function getQuote() {
    setPending('quote'); setFailure('');
    try {
      const payload = currency === 'USD' ? {productId:id,quantity:1,currency:'USD'} : {productId:id,quantity:1};
      const result = await api<QuoteDto>('/quotes',payload);
      key.current = crypto.randomUUID(); setQuote(result); setNow(Date.now());
    } catch(e) { setFailure(e instanceof Error ? e.message : 'Unable to quote.'); }
    finally { setPending(''); }
  }
  async function placeOrder() {
    if(!quote) return;
    setPending('order'); setFailure('');
    try {
      const order = await api<OrderDto>('/orders',{quoteId:quote.id},{'Idempotency-Key':key.current});
      window.location.assign('/orders/'+encodeURIComponent(order.id));
    } catch(e) { setFailure(e instanceof Error ? e.message : 'Unable to place order.'); setPending(''); }
  }
  if(loading) return <Loading label="Loading product details…"/>;
  if(!product) return <section className="product-unavailable">
    <Link className="text-link breadcrumb" href="/">← Back to the store</Link>
    <div role={error ? 'alert' : 'status'}><h1>This product could not be loaded.</h1><p>The product may be unavailable, or the store may need a moment. Return to browsing or try again.</p></div>
    <button type="button" className="button secondary" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Retrying product…' : 'Retry product'}</button>
  </section>;
  const expired = !!quote && new Date(quote.expiresAt).getTime() <= now;
  const displayMinor = product.prices?.[currency]?.amountMinor ?? product.priceMinor;
  const inCart = cartIds.includes(product.id);
  const isFixture = product.id.startsWith('fixture-');
  return <>
    <Link className="text-link breadcrumb" href="/">← Back to the store</Link>
    <div className="product-detail">
      <div className="product-story">
        <div style={{marginBottom:'22px'}}><ProductBrandArt name={product.name} category={product.category} provider={product.provider} variant="hero"/></div>
        <p className="product-category">{product.category}{typeof product.stock === 'number' ? ` · ${product.stock} in stock` : ''}</p>
        <h1>{product.name}</h1>
        <p className="lede" style={{whiteSpace:'pre-line'}}>{product.description}</p>
        <section className="terms" aria-labelledby="product-terms-title">
          <h2 id="product-terms-title">Delivery &amp; terms.</h2>
          <p>{product.terms}</p>
        </section>
        <div className="product-followthrough"><h2>Instant private delivery.</h2><p>Once payment is confirmed, your access credentials or redeem codes are delivered privately inside your signed-in account.</p><Link className="text-link" href="/orders">View your orders</Link></div>
      </div>
      <aside className="panel checkout-panel" aria-label="Checkout">
        <span className="product-mode">{typeof product.stock === 'number' ? `${product.stock} available` : 'In stock'} · {currency}</span>
        <p className="eyebrow checkout-eyebrow">Your price ({currency})</p>
        <p className="display-price" data-testid="product-display-price">{formatMoney(displayMinor,currency)}</p>
        <p className="muted">Pay securely in {currency} ({currency === 'USD' ? '$' : '₦'}) via Paystack or your GOOBER wallet balance.</p>
        <ErrorNotice message={failure} focus/>
        {!isFixture ? <>
          <button type="button" className="button full-width" disabled={!!pending} onClick={() => void buyDirect('paystack')}>
            {pending === 'paystack' ? 'Redirecting to Paystack…' : `Buy now with Paystack (${formatMoney(displayMinor,currency)})`}
          </button>
          <button type="button" className="button secondary full-width" disabled={!!pending} onClick={() => void buyDirect('wallet')}>
            {pending === 'wallet' ? 'Completing order…' : `Pay with ${currency} balance`}
          </button>
          <button type="button" className="button secondary full-width" onClick={() => addToCart(product.id)}>
            {inCart ? 'Added to cart' : 'Add to cart'}
          </button>
        </> : !quote ? <><button className="button full-width" disabled={!!pending} onClick={() => void getQuote()}>{pending ? 'Getting quote…' : 'Get a quote'}</button><button type="button" className="button secondary full-width" onClick={() => addToCart(product.id)}>{inCart ? 'Added to cart' : 'Add to cart'}</button><p className="fine-print">Review the final quote and its terms before committing funds.</p></> : <div className="quote-box">
          <h2>Review your quote</h2><dl className="detail-list"><div><dt>Quantity</dt><dd>1</dd></div><div><dt>Currency</dt><dd>{quote.currency}</dd></div>{quote.exchangeRate && quote.exchangeRate !== '1' && <div><dt>Applied USD/NGN rate</dt><dd>{quote.exchangeRate}</dd></div>}<div><dt>Total ({quote.currency})</dt><dd>{formatMoney(quote.priceMinor,quote.currency)}</dd></div><div><dt>Accept before</dt><dd><DateLabel value={quote.expiresAt}/></dd></div></dl><p className="terms-copy">{quote.terms}</p>
          {expired ? <><p className="notice" role="status">This quote expired. Request a new quote to continue.</p><button className="button full-width" disabled={!!pending} onClick={() => void getQuote()}>{pending ? 'Getting quote…' : 'Get a fresh quote'}</button></> : <><button className="button full-width" disabled={!!pending} onClick={() => void placeOrder()}>{pending === 'order' ? 'Placing order…' : 'Place test order'}</button></>}
        </div>}
        <Link className="text-link" href="/wallet">Manage your {currency} wallet balance</Link>
      </aside>
    </div>
  </>;
}


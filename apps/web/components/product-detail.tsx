'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import type {ProductDto,QuoteDto,OrderDto} from '@goober/contracts';
import {formatMoney} from '@goober/contracts';
import {api} from './api';
import {DateLabel,ErrorNotice,Loading,useResource} from './shared';
import {useCart,useCurrency} from './currency';

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
  return <>
    <Link className="text-link breadcrumb" href="/">← Back to the store</Link>
    <div className="product-detail">
      <div className="product-story">
        <p className="product-category">{product.category}</p><h1>{product.name}</h1><p className="lede">{product.description}</p>
        <section className="terms" aria-labelledby="product-terms-title"><h2 id="product-terms-title">What’s included.</h2><p>{product.terms}</p><p className="product-entitlement">Quantity: 1. This synthetic local test product provides no real third-party entitlement.</p></section>
        <div className="product-followthrough"><h2>After you place an order.</h2><p>Follow its saved progress in your account. Delivery is revealed privately after it is ready, and help stays linked to the order.</p><Link className="text-link" href="/orders">View your orders</Link></div>
      </div>
      <aside className="panel checkout-panel" aria-label="Checkout">
        <span className="product-mode">{product.mode} · Local test product · {currency}</span><p className="eyebrow checkout-eyebrow">Your price ({currency})</p><p className="display-price" data-testid="product-display-price">{formatMoney(displayMinor,currency)}</p><p className="muted">Paid from your GOOBER {currency} test purchasing balance. Live purchasing is disabled.</p>
        <ErrorNotice message={failure} focus/>
        {!quote ? <><button className="button full-width" disabled={!!pending} onClick={() => void getQuote()}>{pending ? 'Getting quote…' : 'Get a quote'}</button><button type="button" className="button secondary full-width" onClick={() => addToCart(product.id)}>{inCart ? 'Added to cart' : 'Add to cart'}</button><p className="fine-print">Review the final quote and its terms before committing test funds.</p></> : <div className="quote-box">
          <h2>Review your quote</h2><dl className="detail-list"><div><dt>Quantity</dt><dd>1</dd></div><div><dt>Currency</dt><dd>{quote.currency}</dd></div>{quote.exchangeRate && quote.exchangeRate !== '1' && <div><dt>Applied USD/NGN rate</dt><dd>{quote.exchangeRate}</dd></div>}<div><dt>Total ({quote.currency})</dt><dd>{formatMoney(quote.priceMinor,quote.currency)}</dd></div><div><dt>Accept before</dt><dd><DateLabel value={quote.expiresAt}/></dd></div></dl><p className="terms-copy">{quote.terms}</p>
          {expired ? <><p className="notice" role="status">This quote expired. Request a new quote to continue.</p><button className="button full-width" disabled={!!pending} onClick={() => void getQuote()}>{pending ? 'Getting quote…' : 'Get a fresh quote'}</button></> : <><button className="button full-width" disabled={!!pending} onClick={() => void placeOrder()}>{pending === 'order' ? 'Placing order…' : 'Place test order'}</button><p className="fine-print">By placing this order you accept the quoted terms. {Math.max(0,Math.ceil((new Date(quote.expiresAt).getTime()-now)/1000))} seconds remain.</p></>}
        </div>}
        <Link className="text-link" href="/wallet">Manage your test balance</Link>
      </aside>
    </div>
  </>;
}


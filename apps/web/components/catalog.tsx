'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {ProductDto} from '@goober/contracts';
import {formatMoney} from '@goober/contracts';
import {Empty,Loading,useResource} from './shared';
import {useCart,useCurrency} from './currency';
import {ProductBrandArt} from './product-brand-art';

const pageSize = 24;
const PREFERRED_CATEGORIES = ['AI Tools','Social Media Accounts','Design & Video','VPN & Privacy','Productivity','Streaming','Education','Music & Audio'];

export function Catalog() {
  const [currency] = useCurrency();
  const {ids:cartIds,add:addToCart} = useCart();
  const endpoint = currency === 'USD' ? '/products?currency=USD' : '/products';
  const {data,loading,refreshing,error,refresh} = useResource<ProductDto[]>(endpoint,{private:false});
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('all');
  const [visibleCount,setVisibleCount] = useState(pageSize);
  useEffect(() => {
    function readFilters() {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get('search') ?? '');
      setCategory(params.get('category') ?? 'all');
      setVisibleCount(pageSize);
    }
    readFilters();
    window.addEventListener('popstate',readFilters);
    return () => window.removeEventListener('popstate',readFilters);
  },[]);
  function changeFilters(nextSearch:string,nextCategory:string) {
    setSearch(nextSearch); setCategory(nextCategory); setVisibleCount(pageSize);
    const url = new URL(window.location.href);
    if(nextSearch) url.searchParams.set('search',nextSearch); else url.searchParams.delete('search');
    if(nextCategory !== 'all') url.searchParams.set('category',nextCategory); else url.searchParams.delete('category');
    window.history.replaceState(null,'',url);
  }
  const rawCategories = [...new Set((data ?? []).map(product => product.category))];
  const categories = [...PREFERRED_CATEGORIES.filter(c => rawCategories.includes(c)),...rawCategories.filter(c => !PREFERRED_CATEGORIES.includes(c))];
  const products = (data ?? []).filter(product => (category === 'all' || product.category === category) && `${product.name} ${product.description}`.toLowerCase().includes(search.toLowerCase()));
  const visibleProducts = products.slice(0,visibleCount);
  const filtered = !!search || category !== 'all';

  return <section id="catalog" className="catalog-section" aria-labelledby="catalog-title">
    <div className="catalog-heading"><div><h2 id="catalog-title">Browse the store.</h2><p>Every product starts with its fixed price in {currency} ({currency === 'USD' ? '$' : '₦'}) and full supplier details.</p></div><span className="catalog-mode">Live catalog · {currency}</span></div>
    {categories.length > 1 && <div className="store-actions" role="group" aria-label="Storefront sections" style={{flexWrap:'wrap',gap:'8px',marginBottom:'16px'}}>
      <button type="button" className={category === 'all' ? 'button small' : 'button secondary small'} onClick={() => changeFilters(search,'all')}>All ({(data ?? []).length})</button>
      {categories.map(cat => <button key={cat} type="button" className={category === cat ? 'button small' : 'button secondary small'} onClick={() => changeFilters(search,cat)}>{cat} ({(data ?? []).filter(p => p.category === cat).length})</button>)}
    </div>}
    <form className="catalog-filters" onSubmit={event => event.preventDefault()}>
      <label htmlFor="catalog-search">Search the store<input id="catalog-search" name="search" type="search" autoComplete="off" placeholder="Search AI tools, social accounts, VPNs, streaming…" value={search} onChange={event => changeFilters(event.target.value,category)}/></label>
      <label htmlFor="catalog-category">Category<select id="catalog-category" name="category" value={category} onChange={event => changeFilters(search,event.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
    </form>
    <div className="catalog-results"><span role="status" aria-live="polite">{loading ? 'Checking the catalog…' : refreshing ? 'Retrying the catalog…' : error ? 'Catalog temporarily unavailable' : `${products.length} product${products.length === 1 ? '' : 's'} found`}</span>{filtered && <button type="button" onClick={() => changeFilters('','all')}>Clear filters</button>}</div>
    {loading ? <Loading label="Loading approved products…"/> : error || refreshing ? <div className="catalog-unavailable" role={error ? 'alert' : 'status'}>
      <h3>The store is temporarily unavailable.</h3><p>Products could not be loaded. Try again shortly; your saved orders stay in your account.</p>
      <button type="button" className="button secondary" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? 'Retrying catalog…' : 'Retry catalog'}</button>
    </div> : products.length ? <>
      <div className="product-grid">{visibleProducts.map(product => {
        const displayMinor = product.prices?.[currency]?.amountMinor ?? product.priceMinor;
        const inCart = cartIds.includes(product.id);
        const firstLine = product.description.split('\n').find(l => l.trim().length > 0) ?? product.description;
        return <article className="product-card catalog-product" key={product.id}>
          <ProductBrandArt name={product.name} category={product.category} provider={product.provider} variant="card"/>
          <div className="product-content"><div className="card-topline"><span className="product-category">{product.category}</span><span className="product-mode">{typeof product.stock === 'number' ? `${product.stock} in stock` : product.provider}</span></div>
            <h3><Link href={'/products/'+encodeURIComponent(product.id)}>{product.name}</Link></h3>
            <p>{firstLine.length > 180 ? firstLine.slice(0,180) + '…' : firstLine}</p>
            <div className="product-bottom"><strong className="price">{formatMoney(displayMinor,currency)}</strong><div className="store-actions"><button type="button" className="button secondary small" onClick={() => addToCart(product.id)}>{inCart ? 'In cart' : 'Add to cart'}</button><Link className="text-link" href={'/products/'+encodeURIComponent(product.id)}>Buy now →</Link></div></div>
          </div>
        </article>;
      })}</div>
      {visibleCount < products.length && <div className="catalog-more"><p>Showing {visibleProducts.length} of {products.length} matching products.</p><button type="button" className="button secondary" onClick={() => setVisibleCount(count => count + pageSize)}>Show more products</button></div>}
    </> : <Empty title={filtered ? 'No products found.' : 'No products available.'}><p>{filtered ? 'Try a different search or category.' : 'There are no published products to browse right now. Check again later.'}</p>{filtered && <button type="button" className="button secondary" onClick={() => changeFilters('','all')}>Reset search</button>}</Empty>}
  </section>;
}


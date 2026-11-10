'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import{useEffect,useState}from 'react';
import{authClient}from '@goober/auth/client';
import type{MeDto}from '@goober/contracts';
import{api}from './api';
import{CurrencySelector,useCart}from './currency';
export function SiteHeader(){
 const pathname=usePathname();const[me,setMe]=useState<MeDto|null>(null),[pending,setPending]=useState(false),[error,setError]=useState('');
 const {ids:cartIds}=useCart();
 useEffect(()=>{let sequence=0,active=true;let controller:AbortController|null=null;const clear=()=>{++sequence;controller?.abort();setMe(null);};const update=()=>{const request=++sequence;controller?.abort();controller=new AbortController();void api<MeDto>('/me',undefined,undefined,controller.signal).then(value=>{if(active&&request===sequence)setMe(value);}).catch(()=>{if(active&&request===sequence)setMe(null);});};update();window.addEventListener('goober:session-expired',clear);window.addEventListener('goober:session-changed',update);return()=>{active=false;++sequence;controller?.abort();window.removeEventListener('goober:session-expired',clear);window.removeEventListener('goober:session-changed',update);};},[pathname]);
 async function signOut(){setPending(true);setError('');try{const result=await authClient.signOut();if(result.error)throw new Error('Sign out did not finish. Please try again.');window.dispatchEvent(new Event('goober:session-expired'));window.location.assign('/');}catch(e){setError(e instanceof Error?e.message:'Sign out did not finish.');setPending(false);}}
 const links = me
   ? [
       ['/', 'Store'],
       ['/wallet', 'Balance'],
       ['/orders', 'Orders'],
       ['/support', 'Help'],
       ...(me.role.toLowerCase() === 'admin' ? [['/operations', 'Operations']] : []),
     ]
   : [['/', 'Store']];
 return (
   <div className="site-header-sticky">
     <header className="site-header">
       <Link className="wordmark" href="/" aria-label="GOOBER home" translate="no">
         <span className="brand-symbol" aria-hidden="true">g.</span>
         GOOBER
       </Link>
       <nav aria-label="Main navigation">
         {links.map(([href, label]) => (
           <Link
             key={href}
             href={href}
             aria-current={
               pathname === href ||
               (href === '/orders' && pathname.startsWith('/orders/')) ||
               (href === '/' && pathname.startsWith('/products/'))
                 ? 'page'
                 : undefined
             }
           >
             {label}
           </Link>
         ))}
         <CurrencySelector />
         {me && (
           <button
             className="button small secondary header-signout-btn"
             disabled={pending}
             onClick={() => void signOut()}
           >
             {pending ? 'Signing out…' : 'Sign out'}
           </button>
         )}
         <Link
           className="header-icon-btn"
           href={me ? '/account' : '/sign-in'}
           aria-label="Your account"
           title={me ? `Account (${me.email})` : 'Your account'}
           aria-current={pathname === '/sign-in' || pathname === '/account' ? 'page' : undefined}
         >
           <svg
             width="20"
             height="20"
             viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             strokeWidth="2"
             strokeLinecap="round"
             strokeLinejoin="round"
             aria-hidden="true"
           >
             <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
             <circle cx="12" cy="7" r="4" />
           </svg>
           {me && <span className="signed-in-dot" aria-hidden="true" />}
         </Link>
         <Link
           className="header-icon-btn header-cart-btn"
           href="/cart"
           aria-label={cartIds.length ? `Cart (${cartIds.length})` : 'Cart'}
           title={cartIds.length ? `Cart (${cartIds.length})` : 'Cart'}
           aria-current={pathname === '/cart' ? 'page' : undefined}
         >
           <svg
             width="20"
             height="20"
             viewBox="0 0 24 24"
             fill="none"
             stroke="currentColor"
             strokeWidth="2"
             strokeLinecap="round"
             strokeLinejoin="round"
             aria-hidden="true"
           >
             <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
             <path d="M3 6h18" />
             <path d="M16 10a4 4 0 0 1-8 0" />
           </svg>
           {cartIds.length > 0 && (
             <span className="header-cart-badge" aria-hidden="true">
               {cartIds.length}
             </span>
           )}
         </Link>
       </nav>
     </header>
     {error && (
       <p className="notice error header-error" role="alert">
         {error}
       </p>
     )}
   </div>
 );
}


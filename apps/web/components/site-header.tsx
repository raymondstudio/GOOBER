'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import{useEffect,useState}from 'react';
import{authClient}from '@goober/auth/client';
import type{MeDto}from '@goober/contracts';
import{api}from './api';
export function SiteHeader(){
 const pathname=usePathname();const[me,setMe]=useState<MeDto|null>(null),[pending,setPending]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let sequence=0,active=true;let controller:AbortController|null=null;const clear=()=>{++sequence;controller?.abort();setMe(null);};const update=()=>{const request=++sequence;controller?.abort();controller=new AbortController();void api<MeDto>('/me',undefined,undefined,controller.signal).then(value=>{if(active&&request===sequence)setMe(value);}).catch(()=>{if(active&&request===sequence)setMe(null);});};update();window.addEventListener('goober:session-expired',clear);window.addEventListener('goober:session-changed',update);return()=>{active=false;++sequence;controller?.abort();window.removeEventListener('goober:session-expired',clear);window.removeEventListener('goober:session-changed',update);};},[pathname]);
 async function signOut(){setPending(true);setError('');try{const result=await authClient.signOut();if(result.error)throw new Error('Sign out did not finish. Please try again.');window.dispatchEvent(new Event('goober:session-expired'));window.location.assign('/');}catch(e){setError(e instanceof Error?e.message:'Sign out did not finish.');setPending(false);}}
 const links=me?[['/','Store'],['/wallet','Balance'],['/orders','Orders'],['/support','Help'],['/account','Account'],...(me.role.toLowerCase()==='admin'?[['/operations','Operations']]:[])]:[['/','Store']];
 return <><header className="site-header"><Link className="wordmark" href="/" aria-label="GOOBER home" translate="no"><span className="brand-symbol" aria-hidden="true">g.</span>GOOBER<span className="brand-caption">Digital, considered.</span></Link><nav aria-label="Main navigation">{links.map(([href,label])=><Link key={href} href={href} aria-current={pathname===href||(href==='/orders'&&pathname.startsWith('/orders/'))?'page':undefined}>{label}</Link>)}{me?<button className="button small secondary" disabled={pending} onClick={()=>void signOut()}>{pending?'Signing out…':'Sign out'}</button>:<Link className="button small" href="/sign-in" aria-current={pathname==='/sign-in'?'page':undefined}>Your account <span aria-hidden="true">↗</span></Link>}</nav></header>{error&&<p className="notice error header-error" role="alert">{error}</p>}</>;
}

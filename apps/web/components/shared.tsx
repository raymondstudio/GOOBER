'use client';
import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {api} from './api';
export function useResource<T>(path:string){const[data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');const active=useRef(true);const refresh=useCallback(async()=>{setError('');try{const value=await api<T>(path);if(active.current)setData(value);}catch(e){if(active.current)setError(e instanceof Error?e.message:'Please try again.');}finally{if(active.current)setLoading(false);}},[path]);useEffect(()=>{active.current=true;setData(null);setLoading(true);void refresh();return()=>{active.current=false;};},[refresh]);return{data,loading,error,refresh};}
export function ErrorNotice({message}:{message:string}){const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(message)ref.current?.focus();},[message]);return message?<div ref={ref} tabIndex={-1} className="notice error" role="alert">{message} <Link href="/sign-in" className="text-link">Account access</Link></div>:null;}
export function PageTitle({eyebrow,title,description}:{eyebrow:string;title:string;description?:string}){return <div className="page-title"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description&&<p className="lede">{description}</p>}</div>;}
export function Status({value}:{value:string}){const text=value.replaceAll('_',' ').toLowerCase();return <span className={'status status-'+value.toLowerCase()}>{text.charAt(0).toUpperCase()+text.slice(1)}</span>;}
export function DateLabel({value}:{value:string}){return <time dateTime={value}>{new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(value))} WAT</time>;}
export function Empty({title,children}:{title:string;children?:ReactNode}){return <div className="empty-panel"><h3>{title}</h3>{children&&<div className="empty-copy">{children}</div>}</div>;}
export function Loading({label='Loading records…'}:{label?:string}){return <p className="loading-message" role="status">{label}</p>;}
export function useOperationId(){const previous=useRef({body:'',id:''});return(body:unknown)=>{const serialized=JSON.stringify(body);if(previous.current.body!==serialized)previous.current={body:serialized,id:crypto.randomUUID()};return previous.current.id;};}

// SSR controls stay inert until React owns submission; native fallback must never put private fields in URLs.
export function useHydrated(){const[hydrated,setHydrated]=useState(false);useEffect(()=>setHydrated(true),[]);return hydrated;}

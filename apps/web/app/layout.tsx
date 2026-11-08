import type { ReactNode } from 'react';
import { SiteHeader } from '../components/site-header';
import './globals.css';
export const metadata = {title:'GOOBER | Digital tools, AI subscriptions & social accounts',description:'Browse GOOBER’s digital marketplace in NGN and USD, pay with Paystack or wallet balance, and receive instant private delivery.'};
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><div className="environment-strip"><span>GOOBER DIGITAL MARKETPLACE</span><span>Instant Digital Delivery · NGN &amp; USD</span></div><SiteHeader/><main id="main" className="main-shell">{children}</main><footer className="site-footer"><strong translate="no">GOOBER</strong><p>A considered home for your digital essentials.</p><span>Verified digital tools, subscriptions, and social accounts in NGN &amp; USD.</span></footer></body></html>;}

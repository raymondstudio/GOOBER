import type { ReactNode } from 'react';
import { SiteHeader } from '../components/site-header';
import './globals.css';
export const metadata = {title:'GOOBER | Digital essentials',description:'GOOBER isolated test storefront'};
export default function RootLayout({children}:{children:ReactNode}) {return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><div className="environment-strip"><span>LOCAL TEST STORE</span><span>Fixture products · Isolated test credit</span></div><SiteHeader/><main id="main" className="main-shell">{children}</main><footer className="site-footer"><strong translate="no">GOOBER</strong><p>A considered home for your digital essentials.</p><span>This local engineering store uses synthetic products and test funds.</span></footer></body></html>;}

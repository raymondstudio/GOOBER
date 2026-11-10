import Image from 'next/image';
import Link from 'next/link';
import {Catalog} from '../components/catalog';

export default function Page() {
  return <>
    <section className="store-intro" aria-labelledby="store-title">
      <div className="store-intro-primary">
        <p className="eyebrow" style={{marginBottom:'14px'}}>GOOBER DIGITAL MARKETPLACE · NGN &amp; USD</p>
        <h1 id="store-title">Digital tools, with the details up front.</h1>
        <p className="store-intro-lead">
          Instant access to AI subscriptions, creative suites, privacy VPNs, streaming plans, and verified social media accounts in NGN (₦) and USD ($). Pay securely with Paystack or your GOOBER wallet balance and receive permanent `.txt` credential docs and access links in your Orders.
        </p>
        <div className="store-actions">
          <Link className="button" href="#catalog">Explore the store</Link>
          <Link className="button secondary" href="/sign-in?action=create">Create account</Link>
        </div>
        <p className="returning-customer">Already have an account? <Link href="/sign-in">Sign in</Link> · Need help? <a href="https://t.me/raymondstudi0" target="_blank" rel="noopener noreferrer">Telegram @raymondstudi0 ↗</a></p>
      </div>

      <div className="store-intro-media" aria-hidden="true">
        <Image
          src="/gooble-hero.png"
          alt="GOOBER digital tools, AI subscriptions and verified accounts"
          width={517}
          height={483}
          priority
          className="store-intro-image"
        />
      </div>
    </section>
    <Catalog/>
    <section className="shopping-guide" aria-labelledby="shopping-guide-title">
      <div><h2 id="shopping-guide-title">From a clear price to a private delivery.</h2><p>Every order is backed by double-entry ledger protection, permanent `.txt` credential downloads, and direct Telegram concierge support (@raymondstudi0).</p></div>
      <ol>
        <li><strong>Choose with the terms in view.</strong><p>Read the full supplier specification and pay directly in NGN or USD via Paystack or your account balance.</p></li>
        <li><strong>Automated instant dispatch.</strong><p>As soon as Paystack confirms payment, GOOBER dispatches your order and encrypts your delivered credentials or redemption link.</p></li>
        <li><strong>Saved permanently in your Orders.</strong><p>Open, copy, or download your `.txt` account details and product access links anytime inside your signed-in account.</p></li>
      </ol>
    </section>
  </>;
}

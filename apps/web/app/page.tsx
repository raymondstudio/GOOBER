import Link from 'next/link';
import {Catalog} from '../components/catalog';

export default function Page() {
  return <>
    <section className="store-intro" aria-labelledby="store-title">
      <h1 id="store-title">Digital tools, with the details up front.</h1>
      <div className="store-intro-copy">
        <p>Find digital tools and services for your work and creative projects. Compare the terms, review your price, and follow each order in one place.</p>
        <div className="store-actions">
          <Link className="button" href="#catalog">Explore the store</Link>
          <Link className="button secondary" href="/sign-in?action=create">Create account</Link>
        </div>
        <p className="returning-customer">Already have an account? <Link href="/sign-in">Sign in</Link></p>
      </div>
      <p className="fixture-note"><strong>You’re browsing the local test store.</strong> Products and funds are synthetic, confer no real entitlement, and cannot make live purchases.</p>
    </section>
    <Catalog/>
    <section className="shopping-guide" aria-labelledby="shopping-guide-title">
      <div><h2 id="shopping-guide-title">From a clear price to a private delivery.</h2><p>Your account keeps the details together, including help linked to your order.</p></div>
      <ol>
        <li><strong>Choose with the terms in view.</strong><p>Read the product details, then request a time-limited quote before committing test funds.</p></li>
        <li><strong>Follow your order.</strong><p>Return to its saved progress and ask for help from the same order when you need it.</p></li>
        <li><strong>Reveal delivery privately.</strong><p>Open delivery inside your signed-in account and hide it when you’re finished.</p></li>
      </ol>
    </section>
  </>;
}

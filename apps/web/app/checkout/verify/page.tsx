'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FundingDto } from '@goober/contracts';
import { formatMoney } from '@goober/contracts';
import { api } from '../../../components/api';
import { ErrorNotice, Loading, PageTitle } from '../../../components/shared';

export default function CheckoutVerifyPage() {
  const [status, setStatus] = useState<'verifying' | 'done' | 'error'>('verifying');
  const [result, setResult] = useState<FundingDto | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reference = params.get('reference') ?? params.get('trxref') ?? '';
    if (!reference) {
      setError('No Paystack payment reference was provided in the callback URL.');
      setStatus('error');
      return;
    }
    let cancelled = false;
    async function run() {
      try {
        const verified = await api<FundingDto>('/wallet/fund/paystack/verify', { reference });
        if (cancelled) return;
        setResult(verified);
        setStatus('done');
        if (verified.orderId) {
          window.location.assign('/orders/' + encodeURIComponent(verified.orderId));
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to verify Paystack transaction.');
        setStatus('error');
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageTitle
        eyebrow="PAYSTACK VERIFICATION"
        title="Confirming your payment."
        description="We are verifying your transaction with Paystack and preparing your order."
      />
      {status === 'verifying' && <Loading label="Verifying Paystack payment and fulfilling order…" />}
      {status === 'error' && (
        <div className="panel">
          <ErrorNotice message={error} />
          <div className="store-actions" style={{ marginTop: '16px' }}>
            <Link className="button" href="/orders">
              View your orders
            </Link>
            <Link className="button secondary" href="/wallet">
              Check wallet balance
            </Link>
          </div>
        </div>
      )}
      {status === 'done' && result && (
        <div className="panel">
          <h2>Payment confirmed ({formatMoney(result.amountMinor, result.currency)})</h2>
          <p>
            Reference: <code>{result.reference}</code> · Status: <strong>{result.status}</strong>
          </p>
          <div className="store-actions" style={{ marginTop: '16px' }}>
            {result.orderId ? (
              <Link className="button" href={'/orders/' + encodeURIComponent(result.orderId)}>
                Open your order →
              </Link>
            ) : (
              <Link className="button" href="/wallet">
                View updated wallet balance →
              </Link>
            )}
            <Link className="button secondary" href="/">
              Continue shopping
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

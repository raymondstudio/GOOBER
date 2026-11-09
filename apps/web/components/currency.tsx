'use client';
import { useEffect, useState } from 'react';
import type { Currency } from '@goober/contracts';

const CURRENCY_KEY = 'goober.currency';
const CART_KEY = 'goober.cart';

function readStoredCurrency(): Currency {
  if (typeof window === 'undefined') return 'NGN';
  try {
    const raw = window.localStorage.getItem(CURRENCY_KEY);
    return raw === 'USD' ? 'USD' : 'NGN';
  } catch {
    return 'NGN';
  }
}

export function setActiveCurrency(next: Currency): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CURRENCY_KEY, next);
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new CustomEvent('goober:currency-changed', { detail: next }));
}

export function useCurrency(): [Currency, (next: Currency) => void] {
  const [currency, setCurrency] = useState<Currency>('NGN');
  useEffect(() => {
    setCurrency(readStoredCurrency());
    const onUpdate = () => setCurrency(readStoredCurrency());
    window.addEventListener('goober:currency-changed', onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener('goober:currency-changed', onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);
  return [currency, setActiveCurrency];
}

export function CurrencySelector() {
  const [currency, setCurrency] = useCurrency();
  return (
    <div className="currency-switch" role="group" aria-label="Display currency">
      <button
        type="button"
        className={`currency-switch-btn ${currency === 'NGN' ? 'active' : ''}`}
        aria-pressed={currency === 'NGN'}
        data-testid="currency-ngn"
        onClick={() => setCurrency('NGN')}
      >
        <span>NGN</span>
        <span className="currency-switch-sym">(₦)</span>
      </button>
      <button
        type="button"
        className={`currency-switch-btn ${currency === 'USD' ? 'active' : ''}`}
        aria-pressed={currency === 'USD'}
        data-testid="currency-usd"
        onClick={() => setCurrency('USD')}
      >
        <span>USD</span>
        <span className="currency-switch-sym">($)</span>
      </button>
    </div>
  );
}

export function readCartIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128).slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function writeCartIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  const unique = [...new Set(ids)].slice(0, 10);
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(unique));
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new CustomEvent('goober:cart-changed'));
}

export function addToCart(productId: string): void {
  const current = readCartIds();
  if (!current.includes(productId)) writeCartIds([...current, productId]);
}

export function removeFromCart(productId: string): void {
  writeCartIds(readCartIds().filter(id => id !== productId));
}

export function clearCart(): void {
  writeCartIds([]);
}

export function useCart(): { ids: string[]; add: (id: string) => void; remove: (id: string) => void; clear: () => void } {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(readCartIds());
    const sync = () => setIds(readCartIds());
    window.addEventListener('goober:cart-changed', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('goober:cart-changed', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return { ids, add: addToCart, remove: removeFromCart, clear: clearCart };
}

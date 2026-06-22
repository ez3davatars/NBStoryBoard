import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADD_ON_CREDIT_PACK_DISPLAY,
  getAddOnCreditPackLabel
} from '../../../utils/billingProducts';

const modalSource = readFileSync(
  fileURLToPath(new URL('../InsufficientCreditModal.tsx', import.meta.url)),
  'utf8'
);

describe('add-on credit pack display catalog (launch pricing)', () => {
  it('shows $12.99 for the 100-credit pack', () => {
    expect(ADD_ON_CREDIT_PACK_DISPLAY.credit_pack_100.launchPriceLabel).toBe('$12.99');
    expect(getAddOnCreditPackLabel('credit_pack_100')).toBe('Add 100 Credits - $12.99');
  });

  it('shows $54.99 for the 500-credit pack', () => {
    expect(ADD_ON_CREDIT_PACK_DISPLAY.credit_pack_500.launchPriceLabel).toBe('$54.99');
    expect(getAddOnCreditPackLabel('credit_pack_500')).toBe('Add 500 Credits - $54.99');
  });

  it('is display-only: no Stripe price ids in the catalog', () => {
    const serialized = JSON.stringify(ADD_ON_CREDIT_PACK_DISPLAY);
    expect(serialized).not.toMatch(/price_/);
    expect(serialized).not.toMatch(/sk_(test|live)_/);
  });
});

describe('insufficient-credit modal renderer', () => {
  it('renders both add-on labels via the typed catalog (no duplicated strings)', () => {
    expect(modalSource).toContain("getAddOnCreditPackLabel('credit_pack_100')");
    expect(modalSource).toContain("getAddOnCreditPackLabel('credit_pack_500')");
  });

  it('no stale $10 / $45 add-on labels remain', () => {
    expect(modalSource).not.toMatch(/Add\s+100\s+Credits\s*-\s*\$10/);
    expect(modalSource).not.toMatch(/Add\s+500\s+Credits\s*-\s*\$45/);
    expect(modalSource).not.toContain('- $10');
    expect(modalSource).not.toContain('- $45');
  });

  it('100-credit button sends productKey credit_pack_100', () => {
    expect(modalSource).toContain('productKey="credit_pack_100"');
  });

  it('500-credit button sends productKey credit_pack_500', () => {
    expect(modalSource).toContain('productKey="credit_pack_500"');
  });

  it('does not offer Starter or Pro subscriptions in the add-on modal', () => {
    expect(modalSource).not.toContain('subscription_starter');
    expect(modalSource).not.toContain('subscription_pro');
    expect(modalSource).not.toMatch(/productKey="subscription/);
  });

  it('credit-pack checkout requires authentication', () => {
    // Credit packs are gated on a valid access token before checkout is created.
    expect(modalSource).toContain('isCreditPack');
    expect(modalSource).toContain('requireAuth: isCreditPack');
    expect(modalSource).toContain('CREDIT_CHECKOUT_AUTH_MESSAGE');
  });

  it('does not send a credit amount or Stripe price id as checkout truth', () => {
    // The modal only ever passes a productKey to createCheckoutSession.
    expect(modalSource).toMatch(/createCheckoutSession\(\s*productKey/);
    expect(modalSource).not.toMatch(/createCheckoutSession\([^)]*price_/);
    expect(modalSource).not.toMatch(/createCheckoutSession\([^)]*credits/);
  });
});

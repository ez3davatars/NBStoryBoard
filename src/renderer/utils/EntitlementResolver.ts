import {
  getByokTierFromProducts,
  inferOwnedBillingProductKeys,
  type BillingProductKey,
  type ByokTier
} from './billingProducts';

export interface Entitlements {
  hasHostedAccess: boolean;
  hasByokAccess: boolean;
  effectiveBillingMode: 'hosted' | 'byok' | 'none';
  byokTier?: ByokTier | null;
  ownedProductKeys?: BillingProductKey[];
}

export class EntitlementResolver {
  /**
   * Feature access is app-wide. Billing mode controls API routing only.
   */
  static resolveEntitlements(
    session: unknown,
    localApiKey: string | null,
    _isDev: boolean = false,
    selectedMode: 'hosted' | 'byok' | null = null
  ): Entitlements {
    const effectiveBillingMode: 'hosted' | 'byok' | 'none' =
      selectedMode ?? (localApiKey?.trim() ? 'byok' : 'hosted');
    const ownedProductKeys = inferOwnedBillingProductKeys(session);
    const byokTier = getByokTierFromProducts(ownedProductKeys);

    return {
      hasHostedAccess: true,
      hasByokAccess: true,
      effectiveBillingMode,
      byokTier,
      ownedProductKeys
    };
  }
}

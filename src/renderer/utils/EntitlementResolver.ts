export interface Entitlements {
  hasHostedAccess: boolean;
  hasByokAccess: boolean;
  effectiveBillingMode: 'hosted' | 'byok' | 'none';
}

export class EntitlementResolver {
  /**
   * Feature access is app-wide. Billing mode controls API routing only.
   */
  static resolveEntitlements(
    _session: unknown,
    localApiKey: string | null,
    _isDev: boolean = false,
    selectedMode: 'hosted' | 'byok' | null = null
  ): Entitlements {
    const effectiveBillingMode: 'hosted' | 'byok' | 'none' =
      selectedMode ?? (localApiKey?.trim() ? 'byok' : 'hosted');

    return {
      hasHostedAccess: true,
      hasByokAccess: true,
      effectiveBillingMode
    };
  }
}

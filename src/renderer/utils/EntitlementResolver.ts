export interface Entitlements {
  hasHostedAccess: boolean;
  hasByokAccess: boolean;
  effectiveBillingMode: 'hosted' | 'byok' | 'none';
}

export class EntitlementResolver {
  /**
   * Resolves entitlements from the authenticated session and local state.
   */
  static resolveEntitlements(
    session: any | null,
    localApiKey: string | null,
    isDev: boolean = false,
    devOverrideMode: 'hosted' | 'byok' | null = null
  ): Entitlements {
    let hasHostedAccess = false;
    let hasByokAccess = false;

    if (session && session.user) {
      const appMetadata = session.user.app_metadata || {};
      const userMetadata = session.user.user_metadata || {};
      
      const rawEntitlements = appMetadata.entitlements || userMetadata.entitlements;
      
      if (Array.isArray(rawEntitlements)) {
        hasHostedAccess = rawEntitlements.includes('hosted');
        hasByokAccess = rawEntitlements.includes('byok');
      }
    }

    let effectiveBillingMode: 'hosted' | 'byok' | 'none' = 'none';

    // Development Override Rule
    if (isDev && devOverrideMode) {
        effectiveBillingMode = devOverrideMode;
        if (devOverrideMode === 'hosted') {
            hasHostedAccess = true;
        } else if (devOverrideMode === 'byok') {
            hasByokAccess = true;
        }
    } 
    // Production Rules
    else {
        if (hasHostedAccess) {
            effectiveBillingMode = 'hosted'; // Prefer hosted if available
        } else if (hasByokAccess && !!localApiKey?.trim()) {
            effectiveBillingMode = 'byok';
        }
    }

    return {
      hasHostedAccess,
      hasByokAccess,
      effectiveBillingMode
    };
  }
}

export interface Entitlements {
  hasHostedAccess: boolean;
  hasByokAccess: boolean;
  effectiveBillingMode: 'hosted' | 'byok' | 'none';
}

type SessionLike = {
  user?: {
    app_metadata?: unknown;
    user_metadata?: unknown;
  } | null;
};

const readEntitlements = (metadata: unknown): string[] | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const record = metadata as Record<string, unknown>;
  if (!Array.isArray(record.entitlements)) return null;
  return record.entitlements.filter((value): value is string => typeof value === 'string');
};

export class EntitlementResolver {
  /**
   * Resolves entitlements from the authenticated session and local state.
   */
  static resolveEntitlements(
    session: SessionLike | null,
    localApiKey: string | null,
    isDev: boolean = false,
    devOverrideMode: 'hosted' | 'byok' | null = null
  ): Entitlements {
    let hasHostedAccess = false;
    let hasByokAccess = false;

    if (session && session.user) {
      const rawEntitlements =
        readEntitlements(session.user.app_metadata) ??
        readEntitlements(session.user.user_metadata);

      if (rawEntitlements) {
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

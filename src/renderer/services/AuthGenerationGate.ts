import { SupabaseAuth } from './SupabaseClient';

export const SIGN_IN_REQUIRED_EVENT = 'cast-director:sign-in-required';

type GenerationBillingMode = 'hosted' | 'byok' | string | undefined;

type GenerationAuthOptions = {
  billingMode?: GenerationBillingMode;
  requireAccountForByok?: boolean;
  featureLabel?: string;
};

export class AuthGateError extends Error {
  readonly code = 'AUTH_REQUIRED_FOR_GENERATION';

  constructor() {
    super('Sign in required for Hosted generation.');
    this.name = 'AuthGateError';
  }
}

export const isAuthGateError = (error: unknown): error is AuthGateError =>
  error instanceof AuthGateError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'AUTH_REQUIRED_FOR_GENERATION'
  );

export const openSignInRequiredModal = (featureLabel?: string) => {
  console.log('[AuthGate] opening sign-in required modal');
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SIGN_IN_REQUIRED_EVENT, { detail: { featureLabel } }));
};

export const hasActiveSupabaseSession = async (): Promise<boolean> => {
  try {
    const result = await SupabaseAuth.getSession();
    if (result?.error) {
      console.warn('[AuthGate] session check failed:', result.error.message);
      return false;
    }

    return Boolean(result?.data?.session?.access_token);
  } catch (error) {
    console.warn('[AuthGate] session check failed:', error);
    return false;
  }
};

export const ensureAuthenticatedForGeneration = async ({
  billingMode,
  requireAccountForByok = false,
  featureLabel
}: GenerationAuthOptions = {}): Promise<boolean> => {
  if (billingMode === 'byok') {
    const hasLicenseId = localStorage.getItem('cds_active_license_id');
    const hasLicenseKey = localStorage.getItem('cds_active_license_key');
    if (!hasLicenseId && !hasLicenseKey) {
      console.log('[AuthGate] generation blocked: no active desktop BYOK license');
      if (typeof window !== 'undefined') {
        alert('Cast Director Studio License Required\n\nA valid desktop license activation is required to run model generation in BYOK mode. Please activate your license from Configuration Settings.');
      }
      return false;
    }
  }

  const requiresSession =
    billingMode === 'hosted' ||
    (billingMode === 'byok' && requireAccountForByok);

  if (!requiresSession) {
    return true;
  }

  const hasSession = await hasActiveSupabaseSession();
  if (hasSession) {
    return true;
  }

  console.log('[AuthGate] generation blocked: no active session');
  openSignInRequiredModal(featureLabel);
  return false;
};

export const assertAuthenticatedForGeneration = async (options?: GenerationAuthOptions): Promise<void> => {
  const allowed = await ensureAuthenticatedForGeneration(options);
  if (!allowed) {
    throw new AuthGateError();
  }
};

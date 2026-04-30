export type HostedImageSize = '1K' | '2K' | '4K';
export type HostedResolutionTier = '1k' | '2k' | '4k';
export type HostedGenerationType = 'standard' | 'character_sheet';
export type HostedCreditRenderType = HostedGenerationType;

export type BillingProductKey =
  | 'credit_pack_100'
  | 'credit_pack_500'
  | 'indie_desktop_byok'
  | 'agency_desktop_byok';

export type ByokTier = 'indie' | 'agency';

export type InsufficientCreditModalState = {
  requiredCredits: number;
  currentCredits: number;
  imageSize?: HostedImageSize;
  resolutionTier?: HostedResolutionTier;
  renderType?: HostedCreditRenderType;
  openedAt: number;
};

export const INSUFFICIENT_HOSTED_CREDITS_EVENT = 'hosted-credits:insufficient';
export const CREDIT_PRICING_VERSION = '1-2-6';

export const toHostedResolutionTier = (imageSize?: HostedImageSize): HostedResolutionTier => {
  if (imageSize === '4K') return '4k';
  if (imageSize === '2K') return '2k';
  return '1k';
};

export const toHostedImageSize = (resolutionTier?: HostedResolutionTier): HostedImageSize => {
  if (resolutionTier === '4k') return '4K';
  if (resolutionTier === '2k') return '2K';
  return '1K';
};

export const calculateRequiredGenerationCredits = (args: {
  imageSize?: HostedImageSize;
  resolutionTier?: HostedResolutionTier;
  generationType?: HostedGenerationType;
  renderType?: HostedCreditRenderType;
} = {}): number => {
  const resolutionTier = args.resolutionTier ?? toHostedResolutionTier(args.imageSize);
  if (resolutionTier === '4k') return 6;
  if (resolutionTier === '2k') return 2;
  return 1;
};

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const PRODUCT_ALIASES: Record<string, BillingProductKey> = {
  credit_pack_100: 'credit_pack_100',
  credit_pack_500: 'credit_pack_500',
  indie_desktop_byok: 'indie_desktop_byok',
  indie_byok: 'indie_desktop_byok',
  byok_indie: 'indie_desktop_byok',
  desktop_byok_indie: 'indie_desktop_byok',
  agency_desktop_byok: 'agency_desktop_byok',
  agency_commercial_byok: 'agency_desktop_byok',
  commercial_byok: 'agency_desktop_byok',
  byok_agency: 'agency_desktop_byok',
  byok_commercial: 'agency_desktop_byok',
  desktop_byok_agency: 'agency_desktop_byok'
};

const ACTIVE_FLAG_VALUES = new Set(['true', 'active', 'owned', 'paid', 'licensed', 'enabled', 'yes']);
const TIER_KEYS = new Set(['byok_tier', 'tier', 'license_tier', 'license', 'plan', 'product', 'product_key', 'sku']);

const addProductAlias = (target: Set<BillingProductKey>, raw: unknown) => {
  if (typeof raw !== 'string') return;

  const normalized = normalizeToken(raw);
  const exact = PRODUCT_ALIASES[normalized];
  if (exact) {
    target.add(exact);
    return;
  }

  if (normalized === 'agency' || normalized === 'commercial') {
    target.add('agency_desktop_byok');
  } else if (normalized === 'indie') {
    target.add('indie_desktop_byok');
  }
};

const collectProductKeys = (value: unknown, target: Set<BillingProductKey>, depth = 0) => {
  if (value === null || value === undefined || depth > 8) return;

  if (typeof value === 'string') {
    addProductAlias(target, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectProductKeys(item, target, depth + 1));
    return;
  }

  if (typeof value !== 'object') return;

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const normalizedKey = normalizeToken(key);
    const normalizedValue = typeof child === 'string' ? normalizeToken(child) : '';

    if (child === true || ACTIVE_FLAG_VALUES.has(normalizedValue)) {
      addProductAlias(target, key);
    }

    if (TIER_KEYS.has(normalizedKey) || normalizedKey.includes('byok')) {
      addProductAlias(target, child);
    }

    collectProductKeys(child, target, depth + 1);
  });
};

export const inferOwnedBillingProductKeys = (...sources: unknown[]): BillingProductKey[] => {
  const owned = new Set<BillingProductKey>();
  sources.forEach((source) => collectProductKeys(source, owned));
  return Array.from(owned);
};

export const getByokTierFromProducts = (productKeys: readonly string[]): ByokTier | null => {
  if (productKeys.includes('agency_desktop_byok')) return 'agency';
  if (productKeys.includes('indie_desktop_byok')) return 'indie';
  return null;
};

export const getByokOwnership = (args: {
  entitlements?: {
    byokTier?: ByokTier | null;
    ownedProductKeys?: string[];
  } | null;
  hostedSession?: unknown;
  apiKey?: string | null;
}) => {
  const ownedProductKeys = inferOwnedBillingProductKeys(args.entitlements, args.hostedSession);
  const explicitTier = args.entitlements?.byokTier ?? getByokTierFromProducts(ownedProductKeys);
  const ownsAgencyByok = explicitTier === 'agency' || ownedProductKeys.includes('agency_desktop_byok');
  const ownsIndieByok =
    ownsAgencyByok ||
    explicitTier === 'indie' ||
    ownedProductKeys.includes('indie_desktop_byok');
  const hasConfiguredByok = Boolean(args.apiKey?.trim());

  return {
    ownedProductKeys,
    byokTier: ownsAgencyByok ? 'agency' as const : ownsIndieByok ? 'indie' as const : null,
    ownsIndieByok,
    ownsAgencyByok,
    ownsAnyByok: ownsIndieByok || ownsAgencyByok,
    canSwitchToByok: ownsIndieByok || ownsAgencyByok || hasConfiguredByok
  };
};

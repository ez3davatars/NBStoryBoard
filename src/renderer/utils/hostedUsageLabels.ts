// Focused, testable helpers for the Hosted Usage panel. The label/credit logic lives here rather
// than inline in App.tsx so it can be unit-tested directly.

import { HOSTED_USAGE_CATEGORY_LABELS } from '../services/hostedAnalysisPolicy';

export { HOSTED_USAGE_CATEGORY_LABELS };

export type HostedUsageMetadata = {
  requiredCredits?: number;
  generationType?: string;
  resolutionTier?: string;
  creditPricingVersion?: string;
  usageCategory?: string;
};

export type HostedUsageRow = {
  id: string;
  created_at?: string | null;
  status?: string | null;
  provider_model?: string | null;
  billing_metadata?: HostedUsageMetadata | null;
};

export const getHostedUsageCredits = (row: HostedUsageRow): number => {
  const requiredCredits = Number(row.billing_metadata?.requiredCredits);
  return Number.isFinite(requiredCredits) && requiredCredits > 0 ? requiredCredits : 0;
};

// Fallback label built from generationType/resolutionTier, e.g. "standard - 1K".
export const formatHostedUsageKind = (row: HostedUsageRow): string => {
  const generationType = row.billing_metadata?.generationType;
  const resolutionTier = row.billing_metadata?.resolutionTier;
  if (generationType && resolutionTier) return `${generationType.replace(/_/g, ' ')} - ${resolutionTier.toUpperCase()}`;
  if (resolutionTier) return resolutionTier.toUpperCase();
  if (generationType) return generationType.replace(/_/g, ' ');
  return row.provider_model?.includes('gemini') ? 'image generation' : 'generation';
};

// Resolves the Hosted Usage label for a row. A server-approved usageCategory wins; otherwise the
// existing generationType/resolutionTier fallback is used so legacy rows keep "standard - 1K" etc.
// Ambiguous historical rows without a usageCategory are never retroactively relabeled.
export const getHostedUsageLabel = (row: HostedUsageRow): string => {
  const usageCategory = row.billing_metadata?.usageCategory;
  if (usageCategory && HOSTED_USAGE_CATEGORY_LABELS[usageCategory]) {
    return HOSTED_USAGE_CATEGORY_LABELS[usageCategory];
  }
  return formatHostedUsageKind(row);
};

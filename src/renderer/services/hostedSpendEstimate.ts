// Pure helpers for the customer-visible pre-flight estimate and post-settlement summary. These produce
// the numbers the UI must show so automatic (now-billable) quality checks never look like unexplained
// deductions. They expose only labels/kinds/model/credit amounts — never prompts, images, or secrets.
//
// NOTE: these are the data primitives. Wiring them into the generation panels + an expandable usage-
// history row is UI work that is NOT yet done (tracked as a deployment blocker).

import {
  computeReservationMicrocredits,
  MICROCREDITS_PER_CREDIT,
  type MeteredBounds
} from './hostedMeteredPricing';
import { getHostedAnalysisPolicy, type HostedAnalysisKind } from './hostedAnalysisPolicy';

// Policy bounds carry maxBillableMicrocredits; the reservation calculator uses the per-call token bounds.
const toMeteredBounds = (kind: HostedAnalysisKind): MeteredBounds => {
  const b = getHostedAnalysisPolicy(kind).bounds;
  return {
    maxOutputTokens: b?.maxOutputTokens ?? 0,
    thinkingBudget: b?.thinkingBudget ?? 0,
    maxImages: b?.maxImages ?? 1,
    maxAttempts: b?.maxAttempts ?? 1,
    maxBillableMicroUsd: b?.maxBillableMicrocredits ?? 0
  };
};

const microToCredits = (micro: bigint): number => Number(micro) / Number(MICROCREDITS_PER_CREDIT);

export type ReservationEstimateInput = {
  /** Reservation for the parent image generation itself, in credits (its bounded max). */
  generationReservationCredits: number;
  /** Automatic analysis kinds that may run as part of this generation. */
  automaticAnalysisKinds: HostedAnalysisKind[];
  /** Bounded number of generation retries to cover. */
  maxRetries: number;
  model: string;
  /** Estimated max input tokens per analysis call (conservative). */
  maxInputTokensPerAnalysis: number;
  creditValueNanoUsd: bigint;
};

export type ReservationEstimate = {
  generationCredits: number;
  automaticAnalysisCredits: number;
  retryCredits: number;
  maxTotalReservationCredits: number;
};

/** Pre-flight maximum reservation a user could be charged: generation + auto-analyses + bounded retries. */
export const estimateMaxReservation = (input: ReservationEstimateInput): ReservationEstimate => {
  let analysisMicro = 0n;
  for (const kind of input.automaticAnalysisKinds) {
    analysisMicro += computeReservationMicrocredits({
      model: input.model,
      bounds: toMeteredBounds(kind),
      maxInputTokens: input.maxInputTokensPerAnalysis,
      creditValueNanoUsd: input.creditValueNanoUsd
    });
  }
  const generationCredits = Math.max(0, input.generationReservationCredits);
  const automaticAnalysisCredits = microToCredits(analysisMicro);
  const retryCredits = Math.max(0, input.maxRetries) * generationCredits;
  return {
    generationCredits,
    automaticAnalysisCredits,
    retryCredits,
    maxTotalReservationCredits: generationCredits + automaticAnalysisCredits + retryCredits
  };
};

export type SettledLineItem = {
  /** Human label (manual analyzers keep their distinct label; gates show their check name). */
  label: string;
  analysisKind?: HostedAnalysisKind;
  providerModel: string;
  customerCredits: number;
  /** 'generation' | 'analysis' | 'retry' */
  kind: 'generation' | 'analysis' | 'retry';
};

export type SettledSummary = {
  generationCredits: number;
  aggregatedAnalysisCredits: number;
  retryCredits: number;
  totalSettledCredits: number;
  releasedCredits: number;
  /** Automatic checks aggregated under the parent; manual analyzers keep their own line. */
  lineItems: SettledLineItem[];
};

/** Aggregates settled per-call charges under the parent generation for the post-settlement display. */
export const summarizeSettledCharges = (params: {
  lineItems: SettledLineItem[];
  reservedCredits: number;
}): SettledSummary => {
  const generationCredits = params.lineItems.filter((l) => l.kind === 'generation').reduce((s, l) => s + l.customerCredits, 0);
  const aggregatedAnalysisCredits = params.lineItems.filter((l) => l.kind === 'analysis').reduce((s, l) => s + l.customerCredits, 0);
  const retryCredits = params.lineItems.filter((l) => l.kind === 'retry').reduce((s, l) => s + l.customerCredits, 0);
  const totalSettledCredits = generationCredits + aggregatedAnalysisCredits + retryCredits;
  return {
    generationCredits,
    aggregatedAnalysisCredits,
    retryCredits,
    totalSettledCredits,
    releasedCredits: Math.max(0, params.reservedCredits - totalSettledCredits),
    lineItems: params.lineItems
  };
};

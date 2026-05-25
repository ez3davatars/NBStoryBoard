export type ProductionActorProfile = {
  id: string;
  name: string;
  sourceImageUrl?: string;
  approvedImageUrl?: string;
  referenceSheetUrl?: string;
  pitchSheetUrl?: string;
  identitySummary?: string;
  styleSummary?: string;
  wardrobeSummary?: string;
  preserveRules: string[];
  avoidRules: string[];
  createdAt: string;
  updatedAt: string;
};

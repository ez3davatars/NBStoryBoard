export type NanoBodyScope = "head" | "torso" | "full";

export type NanoMorphologyKey =
  | "titan"
  | "scout"
  | "guardian"
  | "sprite";

export type NanoStyleKey =
  | "premiumAnimated3D"
  | "premiumCGRealism"
  | "retroCelAnime"
  | "graphicNovelNoir"
  | "cyberpunkV2"
  | "exactLikenessStudio";

export type NanoGenderMode =
  | "masculine"
  | "feminine"
  | "youthBoy"
  | "youthGirl";

export interface NanoIdentityAnchor {
  sourceImageId?: string;
  identityLock: number;
  apparentAge?: number;
  genderMode?: NanoGenderMode;
  biometricSummary?: string;
}

export interface NanoWardrobeLayer {
  outfitPrompt?: string;
  hairPrompt?: string;
  logoPlacement?: string;
  hasLogo?: boolean;
}

export interface NanoBodyOverride {
  active: boolean;
  heightIn?: number;
  weightLbs?: number;
}

export interface NanoActorBlueprint {
  identityAnchor: NanoIdentityAnchor;
  morphologyKey: NanoMorphologyKey;
  styleKey: NanoStyleKey;
  bodyScope: NanoBodyScope;
  wardrobe: NanoWardrobeLayer;
  stylization: number;
  bodyOverride?: NanoBodyOverride;
}

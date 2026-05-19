import type { NanoStyleKey } from "./nanoTypes";

export type NanoStyleProtocol = {
  key: NanoStyleKey;
  label: string;
  positive: string[];
  negative: string[];
};

export const NANO_STYLE_PROTOCOLS: Record<NanoStyleKey, NanoStyleProtocol> = {
  premiumAnimated3D: {
    key: "premiumAnimated3D",
    label: "Premium Animated 3D",
    positive: [
      "Premium animated 3D feature-film character",
      "Pixar-adjacent quality",
      "stylized sculpted forms",
      "appealing simplified materials",
      "soft cinematic animated lighting"
    ],
    negative: [
      "No photorealism",
      "no live-action realism",
      "no realistic skin pores",
      "no mixed realism",
      "no generic cartoon recast"
    ]
  },
  premiumCGRealism: {
    key: "premiumCGRealism",
    label: "Premium CG Realism",
    positive: [
      "Photorealistic high-end CG realism",
      "direct biometric likeness translation",
      "realistic lighting and surface behavior"
    ],
    negative: [
      "No Pixar style",
      "no anime",
      "no cartoon proportions",
      "no illustrated rendering"
    ]
  },
  retroCelAnime: {
    key: "retroCelAnime",
    label: "Retro Cel Anime",
    positive: [
      "90s retro anime aesthetic",
      "clean cel shading",
      "expressive but identity-preserving anime translation"
    ],
    negative: [
      "No western cartoon",
      "no photorealism",
      "no Pixar style",
      "no generic anime face replacement"
    ]
  },
  graphicNovelNoir: {
    key: "graphicNovelNoir",
    label: "Graphic Novel Noir",
    positive: [
      "Graphic novel noir illustration",
      "bold ink structure",
      "dramatic light and shadow",
      "identity-preserving illustrated translation"
    ],
    negative: [
      "No anime",
      "no Pixar style",
      "no photorealism",
      "no random noir character replacement"
    ]
  },
  cyberpunkV2: {
    key: "cyberpunkV2",
    label: "Cyberpunk V2",
    positive: [
      "Cyberpunk cinematic rendering",
      "neon rim lighting",
      "high-tech visual language",
      "identity-preserving stylized translation"
    ],
    negative: [
      "No generic sci-fi replacement person",
      "no face redesign",
      "no style mixing"
    ]
  },
  exactLikenessStudio: {
    key: "exactLikenessStudio",
    label: "Exact Likeness Studio",
    positive: [
      "Maximum biometric preservation",
      "minimal stylization",
      "direct likeness studio render"
    ],
    negative: [
      "No beautification",
      "no age shift",
      "no ethnicity shift",
      "no face redesign",
      "no stylized exaggeration"
    ]
  }
};

export const buildNanoStyleProtocol = (key: NanoStyleKey, stylization: number): string => {
  const protocol = NANO_STYLE_PROTOCOLS[key];
  return `STYLE TRANSLATION PROTOCOL:
- Selected style: ${protocol.label}.
- Stylization intensity: ${Math.max(0, Math.min(100, Math.round(stylization)))}%.
- Positive style language: ${protocol.positive.join(", ")}.
- Style negatives: ${protocol.negative.join(", ")}.
- The style translator changes rendering style, material response, lighting, surface treatment, edge language, and simplification only.
- The style translator must not change identity geometry, age impression, body identity, hairstyle, facial hair, or recognizable likeness.`;
};

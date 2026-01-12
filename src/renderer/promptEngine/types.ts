export interface CharacterBible {
  identity: string;
  wardrobe: string;
  emotionalState: string;
  lockedTraits: string[]; // e.g. ["Face structure", "Scar on left cheek"]
}

export interface StyleBible {
  visualStyle: string; // Hyperrealistic, Cinematic, Anime, etc.
  lighting: string;
  colorPalette: string;
  lensLanguage: string; // e.g. "35mm anamorphic, shallow depth of field"
}

export interface EnvironmentBible {
  setting: string;
  props: string[];
  weatherTime: string;
  lockedElements: string[]; // e.g. ["Table position", "Background window"]
}

export interface MotionDelta {
  cameraMovement: string; // "Static", "Truck Left", "Zoom In"
  characterAction: string; // "Character lifts cup", "Turn head left"
}

export interface Veo31Spec {
  character: CharacterBible;
  style: StyleBible;
  environment: EnvironmentBible;
  motion: MotionDelta;
  frame1Description: string;
  frame2Description: string;
  duration?: number; // optional, assumed standard if missing
}

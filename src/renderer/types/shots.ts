import type { ActorIdentityReferenceSet } from '../context/AppContext';

export type ShotsModeTab = 'stage' | 'result' | 'shots';

export type ShotPackId =
  | 'auto'
  | 'cinematic'
  | 'portrait'
  | 'coverage';

export type ShotPresetId =
  | 'closeup'
  | 'mediumClose'
  | 'medium'
  | 'wide'
  | 'lowAngleHero'
  | 'highAngle'
  | 'threeQuarterLeft'
  | 'threeQuarterRight'
  | 'profile'
  | 'overTheShoulder'
  | 'twoShot';

export type ShotTargetType = 'actor' | 'scene' | 'pair' | 'object';

export type CameraFlavor = 
  | 'neutral' 
  | 'dramatic' 
  | 'procedural' 
  | 'commercial_clean' 
  | 'intimate' 
  | 'kinetic';

export type DirectedShotSlot = {
  id: string;
  index: number;
  targetType: ShotTargetType;
  targetActorId?: string;
  secondaryActorId?: string;
  targetLabel?: string;
  shotType: ShotPresetId;
  actionText?: string;
  cameraFlavor?: CameraFlavor;
  coveragePurpose?: string;
  shotNotes?: string;
};

export type ShotVariantStatus =
  | 'idle'
  | 'queued'
  | 'generating'
  | 'done'
  | 'error'
  | 'rerendering'
  | 'expired';

export type ShotActorReferenceInput = {
  actorId: string;
  actorLabel?: string;
  referenceImageUrls: string[];
  referenceStackId?: string;
};

export type SceneTruthActor = {
  actorId?: string;
  actorLabel?: string;
  leftToRightIndex: number;
  approxZone: 'left' | 'center' | 'right' | 'background' | 'unknown';
  role: 'seated' | 'standing' | 'unknown';
  targetInScene?: string;
};

export type SceneTruthSnapshot = {
  sourceResultUrl: string;
  expectedActorCount: number;
  actors: SceneTruthActor[];
  environment: {
    structuralCues: string[];
    setDressingCues: string[];
  };
  cameraConstraints: {
    allowOverhead: boolean;
    allowDutch: boolean;
    allowExtremeTopDown: boolean;
  };
};

export type ShotVariant = {
  id: string;
  slotId: string;
  slotIndex: number;
  presetId: ShotPresetId;
  label: string;
  description: string;
  prompt: string;
  previewUrl?: string;
  finalUrl?: string;
  localPreviewPath?: string;
  localFinalPath?: string;
  sourcePreviewUrl?: string;
  sourceFinalUrl?: string;
  blueprintUrl?: string;
  
  // Reprojection MVP Phase
  projectionUrl?: string;
  holeMaskUrl?: string;
  repairMaskUrl?: string;
  protectedMaskUrl?: string;
  debugUrl?: string;
  cameraTransform?: { x: number; y: number; z: number; yaw: number; pitch: number; fov: number };
  
  coveragePurpose?: string;
  targetRole?: string;
  targetType?: ShotTargetType;
  actionText?: string;
  cameraFlavor?: CameraFlavor;
  shotNotes?: string;
  sceneType?: string;
  selected: boolean;
  status: ShotVariantStatus;
  error?: string;
};

export type ShotLocks = {
  identity: boolean;
  wardrobe: boolean;
  background: boolean;
  lighting: boolean;
};

export type ShotPinPoint = {
  x: number;
  y: number;
};

export type ShotSession = {
  id: string;
  sceneId: string;
  sourceResultUrl: string;
  actorIdentitySets?: ActorIdentityReferenceSet[];
  packId: ShotPackId;
  count: 4 | 6 | 9;
  directedShots?: DirectedShotSlot[];
  locks: ShotLocks;
  sceneTruth?: SceneTruthSnapshot;
  subjectAnchorPoint?: ShotPinPoint;
  lookTargetPoint?: ShotPinPoint;
  variants: ShotVariant[];
  createdAt: string;
  updatedAt: string;
  isGenerating: boolean;
  isRerenderingSelected: boolean;
};

export type CoverageSceneType =
  | 'courtroom'
  | 'dialogue'
  | 'action'
  | 'commercial'
  | 'interview'
  | 'fashion'
  | 'office'
  | 'generic';

export type CoverageShotPlanItem = {
  presetId: ShotPresetId;
  purpose: string;
  targetRole?: string;
  notes?: string;
};

export type CoverageTemplate = {
  sceneType: CoverageSceneType;
  label: string;
  shots4: CoverageShotPlanItem[];
  shots6: CoverageShotPlanItem[];
  shots9: CoverageShotPlanItem[];
};

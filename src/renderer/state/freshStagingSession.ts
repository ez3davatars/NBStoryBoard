export const FRESH_STAGING_SESSION = {
  activeStageTab: 'stage',

  scenePrompt: '',
  sceneNotes: '',
  sceneReferenceImage: null,
  sceneGeneratedImage: null,
  sceneResultImage: null,
  stageResultImage: null,
  resultImage: null,

  stageLayers: [],
  selectedStageLayerId: null,
  selectedTokenId: null,

  selectedCastAssetId: null,
  selectedReferenceSlot: null,
  activeReferenceSlots: [],

  replaceAnchorSubjects: false,
  anchorSubjectText: '',

  sceneDirectorSubject: '',
  sceneDirectorEnvironment: '',
  sceneDirectorLighting: null,
  sceneDirectorCamera: null,
  sceneDirectorLayout: 'default',

  compiledPrompt: '',
  promptInstructions: '',
  currentPromptInstructions: '',

  autoStyleEnvironment: false,
  targetStudioStyle: null,
  styleOverride: null,
  mergeStrategy: 'character_identity',

  depthMapUrl: null,
  isDepthProcessing: false,
  floorPlane: null,
  occupiedVolumes: [],
} as const;

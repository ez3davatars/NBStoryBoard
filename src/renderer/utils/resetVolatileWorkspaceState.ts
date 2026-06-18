import { StorageService } from '../services/StorageService';

export const VOLATILE_WORKSPACE_STORAGE_PREFIXES = [
  'staging:',
  'scene-generator:',
  'scene-director:',
  'scene:',
  'canvas:',
  'prompt:',
  'prompt-engine:',
  'reference-dna:',
  'reference-slot:',
  'selected-token:',
  'selected-reference:',
  'selected-cast:',
  'active-layer:',
  'stage:',
  'stage-result:',
  'anchor-replacement:',
  'auto-style:',
  'actor-analyzer:',
  'temporary-generation:',
];

const VOLATILE_WORKSPACE_STORAGE_PATTERNS = [
  'staging',
  'stage',
  'scene-generator',
  'scene_generator',
  'scenegenerator',
  'scene-director',
  'scene_director',
  'scenedirector',
  'prompt-engine',
  'prompt_engine',
  'promptengine',
  'compiled-prompt',
  'compiled_prompt',
  'compiledprompt',
  'result-image',
  'result_image',
  'resultimage',
  'scene-result',
  'scene_result',
  'sceneresult',
  'scene-reference',
  'scene_reference',
  'scenereference',
  'anchor-replacement',
  'anchor_replacement',
  'anchorreplacement',
  'replace-anchor',
  'replace_anchor',
  'replaceanchor',
  'selected-reference',
  'selected_reference',
  'selectedreference',
  'selected-token',
  'selected_token',
  'selectedtoken',
  'selected-cast',
  'selected_cast',
  'selectedcast',
  'reference-dna',
  'reference_dna',
  'referencedna',
  'auto-style',
  'auto_style',
  'autostyle',
  'style-override',
  'style_override',
  'styleoverride',
];

const PRESERVED_WORKSPACE_STORAGE_PATTERNS = [
  'license',
  'auth',
  'user',
  'api',
  'byok',
  'hosted',
  'credits',
  'library',
  'asset-library',
  'actor-library',
  'saved-actor',
  'saved_actor',
  'recent-generations-collapsed',
  'stage_panel_state',
  'panel_order',
  'left_panel_order',
  'veo_layout',
];

export const VOLATILE_WORKSPACE_LOCAL_STORAGE_KEYS = [
  'activeStageLayers',
  'selectedStageToken',
  'selectedReferenceSlot',
  'stagingPrompt',
  'scenePrompt',
  'sceneNotes',
  'sceneReferenceImage',
  'sceneGeneratedImage',
  'sceneResultImage',
  'stageResultImage',
  'activeStageTab',
  'referenceDnaNotes',
  'referenceDnaAlias',
  'selectedCastAssetId',
  'subjectReplacementEnabled',
  'replaceAnchorSubjects',
  'anchorSubjectText',
  'sceneDirectorSubject',
  'sceneDirectorEnvironment',
  'sceneDirectorLighting',
  'sceneDirectorCamera',
  'sceneDirectorLayout',
  'compiledPrompt',
  'promptInstructions',
  'targetStudioStyle',
  'mergeStrategy',
  'autoStyleEnvironment',
  'styleOverride',
  'currentPromptInstructions',
  'nano_director_v3',
  'nano_bg_url',
  'nano_depth_url',
  'nano_depth_hash',
  'nano_source_hash',
  'nano_floor_plane',
  'nano_occupied_volumes',
  'nano_active_shot_id',
  'nano_tokens',
  'nano_annotations',
  'nano_shots',
  'nano_shot_sessions',
];

export const VOLATILE_WORKSPACE_DATASTORE_KEYS = [
  'nano_tokens',
  'nano_annotations',
  'nano_shots',
  'nano_shot_sessions',
];

const getLocalStorage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const getSessionStorage = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

export function clearVolatileWorkspaceStorage(): void {
  const local = getLocalStorage();
  if (local) {
    const exactKeys = new Set(VOLATILE_WORKSPACE_LOCAL_STORAGE_KEYS);
    for (const key of Object.keys(local)) {
      const lower = key.toLowerCase();
      const shouldPreserve = PRESERVED_WORKSPACE_STORAGE_PATTERNS.some((pattern) =>
        lower.includes(pattern)
      );
      if (shouldPreserve) continue;

      if (
        exactKeys.has(key) ||
        VOLATILE_WORKSPACE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
        VOLATILE_WORKSPACE_STORAGE_PATTERNS.some((pattern) => lower.includes(pattern))
      ) {
        local.removeItem(key);
      }
    }
  }

  getSessionStorage()?.clear();
}

export const clearVolatileStagingStorage = clearVolatileWorkspaceStorage;

export function dumpBrowserStorage(label: string): void {
  if (!import.meta.env.DEV) return;

  const local = getLocalStorage();
  const session = getSessionStorage();

  console.group(`[STAGING STORAGE AUDIT] ${label}`);

  console.group('localStorage');
  if (local) {
    Object.keys(local).sort().forEach((key) => {
      const lower = key.toLowerCase();

      if (
        lower.includes('stage') ||
        lower.includes('staging') ||
        lower.includes('scene') ||
        lower.includes('prompt') ||
        lower.includes('result') ||
        lower.includes('anchor') ||
        lower.includes('reference') ||
        lower.includes('director') ||
        lower.includes('cast') ||
        lower.includes('token') ||
        lower.includes('style') ||
        lower.includes('generation')
      ) {
        console.log(key, local.getItem(key));
      }
    });
  }
  console.groupEnd();

  console.group('sessionStorage');
  if (session) {
    Object.keys(session).sort().forEach((key) => {
      console.log(key, session.getItem(key));
    });
  }
  console.groupEnd();

  console.groupEnd();
}

export const debugDumpVolatileStorageKeys = dumpBrowserStorage;

export async function clearVolatileWorkspaceDataStores(): Promise<void> {
  await Promise.all(
    VOLATILE_WORKSPACE_DATASTORE_KEYS.map(async (key) => {
      try {
        await StorageService.remove(key);
      } catch (error) {
        console.warn(`[WorkspaceReset] Failed to clear volatile datastore key ${key}`, error);
      }
    })
  );
}

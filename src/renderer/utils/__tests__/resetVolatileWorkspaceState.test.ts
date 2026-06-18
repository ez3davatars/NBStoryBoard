import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearVolatileWorkspaceStorage,
  VOLATILE_WORKSPACE_DATASTORE_KEYS,
} from '../resetVolatileWorkspaceState';

const createStorageMock = (initial: Record<string, string> = {}): Storage => {
  const values = { ...initial };
  const storage = {
    get length() {
      return Object.keys(values).length;
    },
    clear: vi.fn(() => {
      for (const key of Object.keys(values)) {
        delete values[key];
        delete (storage as Record<string, unknown>)[key];
      }
    }),
    getItem: vi.fn((key: string) => values[key] ?? null),
    key: vi.fn((index: number) => Object.keys(values)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete values[key];
      delete (storage as Record<string, unknown>)[key];
    }),
    setItem: vi.fn((key: string, value: string) => {
      values[key] = value;
      (storage as Record<string, unknown>)[key] = value;
    }),
  };

  for (const [key, value] of Object.entries(values)) {
    (storage as Record<string, unknown>)[key] = value;
  }

  return storage as Storage;
};

describe('clearVolatileWorkspaceStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears transient staging keys and keeps persistent app data', () => {
    const localStorage = createStorageMock({
      'staging:layers': 'old layers',
      'reference-dna:slot-1': 'old dna',
      'scene-generator:result': 'old scene generator result',
      scene_generator_result: 'old scene generator result',
      sceneDirectorEnvironment: 'old environment',
      'prompt-engine:compiled': 'old compiled prompt',
      promptEngineCompiled: 'old compiled prompt',
      'selected-cast:asset': 'old selected cast',
      selected_reference_slot: 'slot 1',
      selectedStageToken: 'token-1',
      scenePrompt: 'old scene',
      sceneGeneratedImage: 'data:image/png;base64,scene',
      stageResultImage: 'data:image/png;base64,result',
      compiledPrompt: 'old compiled output',
      replaceAnchorSubjects: 'true',
      targetStudioStyle: 'comic_book',
      nano_director_v3: '{"prompt":"old"}',
      nano_bg_url: 'data:image/png;base64,old',
      nano_depth_url: 'data:image/png;base64,old',
      nano_tokens: 'legacy token backup',
      nano_shots: 'legacy shot backup',
      nano_api_key: 'persisted byok key',
      nano_billing_mode: '"hosted"',
      nano_actors: 'saved actors',
      nano_wardrobe: 'saved wardrobe',
      nano_props: 'saved props',
      actor_library_layout: 'saved library preference',
      nano_stage_panel_state: '{"scene_director":true}',
      nano_panel_order: '["anchor","cast_palette"]',
      nano_save_path: 'F:/Library',
      nano_help_hints: 'false',
      nano_recent_generations: '[]',
    });
    const sessionStorage = createStorageMock({
      temporaryPromptScratch: 'old prompt',
    });

    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('sessionStorage', sessionStorage);

    clearVolatileWorkspaceStorage();

    expect(localStorage.getItem('staging:layers')).toBeNull();
    expect(localStorage.getItem('reference-dna:slot-1')).toBeNull();
    expect(localStorage.getItem('scene-generator:result')).toBeNull();
    expect(localStorage.getItem('scene_generator_result')).toBeNull();
    expect(localStorage.getItem('sceneDirectorEnvironment')).toBeNull();
    expect(localStorage.getItem('prompt-engine:compiled')).toBeNull();
    expect(localStorage.getItem('promptEngineCompiled')).toBeNull();
    expect(localStorage.getItem('selected-cast:asset')).toBeNull();
    expect(localStorage.getItem('selected_reference_slot')).toBeNull();
    expect(localStorage.getItem('selectedStageToken')).toBeNull();
    expect(localStorage.getItem('scenePrompt')).toBeNull();
    expect(localStorage.getItem('sceneGeneratedImage')).toBeNull();
    expect(localStorage.getItem('stageResultImage')).toBeNull();
    expect(localStorage.getItem('compiledPrompt')).toBeNull();
    expect(localStorage.getItem('replaceAnchorSubjects')).toBeNull();
    expect(localStorage.getItem('targetStudioStyle')).toBeNull();
    expect(localStorage.getItem('nano_director_v3')).toBeNull();
    expect(localStorage.getItem('nano_bg_url')).toBeNull();
    expect(localStorage.getItem('nano_depth_url')).toBeNull();
    expect(localStorage.getItem('nano_tokens')).toBeNull();
    expect(localStorage.getItem('nano_shots')).toBeNull();

    expect(localStorage.getItem('nano_api_key')).toBe('persisted byok key');
    expect(localStorage.getItem('nano_billing_mode')).toBe('"hosted"');
    expect(localStorage.getItem('nano_actors')).toBe('saved actors');
    expect(localStorage.getItem('nano_wardrobe')).toBe('saved wardrobe');
    expect(localStorage.getItem('nano_props')).toBe('saved props');
    expect(localStorage.getItem('actor_library_layout')).toBe('saved library preference');
    expect(localStorage.getItem('nano_stage_panel_state')).toBe('{"scene_director":true}');
    expect(localStorage.getItem('nano_panel_order')).toBe('["anchor","cast_palette"]');
    expect(localStorage.getItem('nano_save_path')).toBe('F:/Library');
    expect(localStorage.getItem('nano_help_hints')).toBe('false');
    expect(localStorage.getItem('nano_recent_generations')).toBe('[]');
    expect(sessionStorage.clear).toHaveBeenCalledOnce();
  });

  it('documents the IndexedDB keys cleared by the launch datastore reset', () => {
    expect(VOLATILE_WORKSPACE_DATASTORE_KEYS).toEqual([
      'nano_tokens',
      'nano_annotations',
      'nano_shots',
      'nano_shot_sessions',
    ]);
  });
});

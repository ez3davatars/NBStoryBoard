import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LibraryAssetMaterializer } from '../../services/LibraryAssetMaterializer';
import type { ProductionActorProfile } from '../../types/ProductionActorProfile';

// Mock electron API
const mockElectronAPI = {
  joinPath: vi.fn(async (...args: string[]) => args.join('/')),
  createDir: vi.fn(async () => true),
  writeFile: vi.fn(async () => true),
  readFile: vi.fn(async () => 'mockBase64Data'),
  readTextFile: vi.fn(async () => ''),
  exists: vi.fn(async () => true),
};

describe('Production Actor JSON sidecar persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = {
      electronAPI: mockElectronAPI,
    } as any;
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      blob: async () => new Blob(['mock-data'], { type: 'image/png' }),
    });
    class MockFileReader {
      onloadend: () => void = () => {};
      result: string = 'data:image/png;base64,mockBase64Data';
      readAsDataURL(_blob: Blob) {
        setTimeout(() => this.onloadend(), 0);
      }
    }
    (globalThis as any).FileReader = MockFileReader;
  });

  it('correctly constructs and saves structured production profile sidecar JSON alongside png', async () => {
    const profileInput: Omit<ProductionActorProfile, 'approvedImageUrl' | 'sourceImageUrl'> = {
      id: 'prod-actor-999',
      name: 'Abner',
      identitySummary: 'Strong jawline, gray beard',
      styleSummary: 'Cinematic lighting',
      wardrobeSummary: 'Barefoot sleeveless tank top',
      preserveRules: ['Keep facial structure', 'Bald crown'],
      avoidRules: ['No extra hair', 'No cartoon face'],
      createdAt: '2026-05-26T20:00:00Z',
      updatedAt: '2026-05-26T20:00:00Z',
    };

    (mockElectronAPI.writeFile as any).mockResolvedValue(true);

    const result = await LibraryAssetMaterializer.materializeCastAsset({
      sourceUrl: 'http://example.com/abner.png',
      saveDirectoryPath: 'C:/workspace/CastDirectorStudio',
      actorName: 'Abner',
      category: 'Production Cast',
      productionProfile: profileInput,
    });

    expect(result.localPath).toContain('Library/ProductionActors/Abner_ProductionActor_999/actor.png');
    expect(result.filename).toContain('Library/ProductionActors/Abner_ProductionActor_999/actor.png');
    expect(mockElectronAPI.writeFile).toHaveBeenCalledTimes(3);

    // Verify first write (the image binary buffer)
    const firstWriteArgs = (mockElectronAPI.writeFile.mock.calls as any)[0];
    expect(firstWriteArgs[0]).toContain('actor.png');

    // Verify second write (the json sidecar payload)
    const secondWriteArgs = (mockElectronAPI.writeFile.mock.calls as any)[1];
    expect(secondWriteArgs[0]).toContain('actor.json');

    const writtenJson = new TextDecoder().decode(secondWriteArgs[1]);
    const parsed = JSON.parse(writtenJson);
    expect(parsed.id).toBe('prod-actor-999');
    expect(parsed.name).toBe('Abner');
    expect(parsed.identitySummary).toBe('Strong jawline, gray beard');
    expect(parsed.preserveRules).toContain('Keep facial structure');
  });
});

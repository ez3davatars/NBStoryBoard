import { useCallback } from 'react';
import type { AppState, Action, RegionEditState } from '../context/AppContext';
import { StorageService } from '../services/StorageService';
import { APP_SCHEMA_VERSION } from '../context/AppContext';
import { compileV3DirectorPrompt, getActiveReferenceSlots } from '../utils/promptHelpers';

const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    return String(error);
};

const sanitizeName = (name: string) =>
    name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_').slice(0, 50) || 'Shot';

const writeFileToDir = async (dir: FileSystemDirectoryHandle, filename: string, blob: Blob) => {
    const handle = await dir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
};

const writeDataUrlPng = async (dir: FileSystemDirectoryHandle, filename: string, dataUrl: string) => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await writeFileToDir(dir, filename, blob);
};

const writeTextFile = async (dir: FileSystemDirectoryHandle, filename: string, text: string) => {
    await writeFileToDir(dir, filename, new Blob([text], { type: 'text/plain' }));
};

const verifyFilesExist = async (dir: FileSystemDirectoryHandle, required: string[]) => {
    const missing: string[] = [];
    for (const name of required) {
        try {
            await dir.getFileHandle(name);
        } catch {
            missing.push(name);
        }
    }
    return missing;
};

const exportRegionEditAssets = async (
    shotDir: FileSystemDirectoryHandle,
    regionEdit: RegionEditState | undefined,
    dispatch: React.Dispatch<Action>
) => {
    try {
        if (!regionEdit) return;

        const regionDir = await shotDir.getDirectoryHandle('region_edit', { create: true });

        if (regionEdit.protectMaskDataUrl) {
            await writeDataUrlPng(regionDir, 'protect_mask.png', regionEdit.protectMaskDataUrl);
        }
        await writeTextFile(regionDir, 'protect_enabled.txt', String(Boolean(regionEdit.protectEnabled)));

        await writeFileToDir(
            regionDir,
            'queue.json',
            new Blob([JSON.stringify(regionEdit, null, 2)], { type: 'application/json' })
        );

        const layers = Array.isArray(regionEdit.layers) ? regionEdit.layers : [];
        const outDir = await regionDir.getDirectoryHandle('outputs', { create: true });

        for (const layer of layers) {
            const id = String(layer.id || '').toUpperCase();
            const safeId = id && ['A', 'B', 'C'].includes(id) ? id : 'X';

            await writeTextFile(regionDir, `prompt_${safeId}.txt`, layer.prompt || '');
            if (layer.maskDataUrl) {
                await writeDataUrlPng(regionDir, `mask_${safeId}.png`, layer.maskDataUrl);
            }
            if (layer.lastOutputUrl) {
                await writeDataUrlPng(outDir, `out_${safeId}.png`, layer.lastOutputUrl);
            }
        }
    } catch (e: unknown) {
        dispatch({ type: 'ADD_LOG', payload: { message: `Region edit export warning: ${getErrorMessage(e)}`, type: 'error' } });
    }
};

export const useProductionExports = (state: AppState, dispatch: React.Dispatch<Action>) => {
    const activeShot = state.activeShotId ? state.shots.find(s => s.id === state.activeShotId) ?? null : null;

    const handleSaveActiveShot = useCallback(() => {
        if (!activeShot) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } });
            return;
        }
        dispatch({ type: 'SAVE_ACTIVE_SHOT', payload: { touchUpdatedAt: true } });
        dispatch({ type: 'ADD_LOG', payload: { message: `Saved snapshot for shot: ${activeShot.name}`, type: 'success' } });
    }, [activeShot, dispatch]);


    const handleExportDiagnostics = useCallback(async () => {
        if (!state.saveDirectoryHandle) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No save directory selected (Settings).', type: 'error' } });
            return;
        }
        try {
            const root = await state.saveDirectoryHandle.getDirectoryHandle('Diagnostics', { create: true });
            const folderName = `DIAG-${Date.now()}`;
            const dir = await root.getDirectoryHandle(folderName, { create: true });

            const schemaLocal = localStorage.getItem('nano_schema_version') || '';
            const schemaStored = await StorageService.load<number>('nano_schema_version', 0);
            const { apiKey, saveDirectoryHandle, ...restState } = state;

            const diag = {
                app: 'NBStoryBoard',
                createdAt: new Date().toISOString(),
                appSchemaVersion: APP_SCHEMA_VERSION,
                schemaLocalStorage: schemaLocal,
                schemaStorageService: schemaStored,
                userAgent: navigator.userAgent,
                view: state.view,
                activeShotId: state.activeShotId ?? null,
                shotCount: state.shots.length,
                note: 'State snapshot is redacted (apiKey removed).',
                state: {
                    ...restState,
                    apiKey: apiKey ? `REDACTED_${String(apiKey).length}` : '',
                    hasSaveDirectory: Boolean(saveDirectoryHandle),
                },
                logs: state.logs?.slice(-200) ?? [],
            };

            await writeFileToDir(dir, 'diagnostics.json', new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' }));
            await writeTextFile(dir, 'logs.txt', (state.logs || []).slice(-200).map((l) => `${l.timestamp} [${l.type}] ${l.message}`).join('\n'));

            dispatch({ type: 'ADD_LOG', payload: { message: `Diagnostics exported: Diagnostics/${folderName}`, type: 'success' } });
        } catch (e: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Diagnostics export failed: ${getErrorMessage(e)}`, type: 'error' } });
        }
    }, [dispatch, state]);

    const handleExportActiveShotPack = useCallback(async (compiledPrompt: string, strictMode: boolean) => {
        if (!activeShot) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No active shot selected.', type: 'error' } });
            return;
        }
        if (!state.saveDirectoryHandle) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No save directory selected (Settings).', type: 'error' } });
            return;
        }

        dispatch({ type: 'SET_PROCESSING', payload: true });
        try {
            dispatch({ type: 'SAVE_ACTIVE_SHOT', payload: { touchUpdatedAt: true } });

            const root = await state.saveDirectoryHandle.getDirectoryHandle('ShotPacks', { create: true });
            const folderName = `SHOT-${Date.now()}-${sanitizeName(activeShot.name)}`;
            const shotDir = await root.getDirectoryHandle(folderName, { create: true });

            const pack = {
                app: 'NBStoryBoard',
                exportedAt: new Date().toISOString(),
                shot: {
                    id: activeShot.id,
                    name: activeShot.name,
                    createdAt: activeShot.createdAt,
                    updatedAt: Date.now(),
                    notes: activeShot.notes || '',
                },
                render: {
                    strictMode,
                    model: state.model,
                    aspectRatio: state.director.aspectRatio,
                },
                director: state.director,
                anchorDNA: {
                    environment: state.director.environment,
                    lighting: state.director.lighting,
                    camera: state.director.camera,
                },
                compiledPrompt,
                stage: {
                    backgroundUrl: state.backgroundUrl || null,
                    tokens: state.tokens.map((t) => ({
                        id: t.id,
                        tag: t.tag,
                        castId: t.castId,
                        x: t.x, y: t.y, width: t.width, height: t.height,
                        rotation: t.rotation,
                        scaleX: t.scaleX, scaleY: t.scaleY,
                        anchorX: t.anchorX, anchorY: t.anchorY,
                        zIndex: t.zIndex,
                        actionNote: t.actionNote || '',
                        intelligence: t.intelligence || '',
                    })),
                    annotations: state.annotations,
                    referenceSlots: state.referenceSlots,
                },
                frames: {
                    start: activeShot.startFrameUrl ?? null,
                    end: activeShot.endFrameUrl ?? null,
                    lastResult: state.resultImage || null,
                }
            };

            await writeFileToDir(shotDir, 'shot.json', new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
            await writeFileToDir(shotDir, 'prompt.txt', new Blob([compiledPrompt || ''], { type: 'text/plain' }));

            if (state.backgroundUrl) await writeDataUrlPng(shotDir, 'background.png', state.backgroundUrl);
            if (activeShot.startFrameUrl) await writeDataUrlPng(shotDir, 'start.png', activeShot.startFrameUrl);
            if (activeShot.endFrameUrl) await writeDataUrlPng(shotDir, 'end.png', activeShot.endFrameUrl);
            if (state.resultImage) await writeDataUrlPng(shotDir, 'last_result.png', state.resultImage);

            const refsDir = await shotDir.getDirectoryHandle('refs', { create: true });
            const activeRefs = getActiveReferenceSlots(state.referenceSlots);
            for (const r of activeRefs) {
                if (!r.url) continue;
                await writeDataUrlPng(refsDir, `ref_${r.index}.png`, r.url);
            }

            const tokensDir = await shotDir.getDirectoryHandle('tokens', { create: true });
            for (const t of state.tokens) {
                if (!t.url) continue;
                await writeDataUrlPng(tokensDir, `token_${sanitizeName(t.tag || t.id)}.png`, t.url);
            }

            await exportRegionEditAssets(shotDir, state.regionEdit, dispatch);

            const required = ['shot.json', 'prompt.txt'];
            if (state.backgroundUrl) required.push('background.png');
            if (activeShot.startFrameUrl) required.push('start.png');
            if (activeShot.endFrameUrl) required.push('end.png');
            const missing = await verifyFilesExist(shotDir, required);
            
            if (missing.length > 0) {
                dispatch({ type: 'ADD_LOG', payload: { message: `Shot Pack exported with missing files: ${missing.join(', ')}`, type: 'error' } });
            } else {
                dispatch({ type: 'ADD_LOG', payload: { message: `Shot Pack exported: ShotPacks/${folderName}`, type: 'success' } });
            }
        } catch (e: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Shot Pack export failed: ${getErrorMessage(e)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    }, [activeShot, dispatch, state]);

    const handleExportAllShotPacks = useCallback(async () => {
        if (!state.saveDirectoryHandle) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No save directory selected (Settings).', type: 'error' } });
            return;
        }
        const shots = state.shots;
        if (shots.length === 0) {
            dispatch({ type: 'ADD_LOG', payload: { message: 'No shots available to export.', type: 'error' } });
            return;
        }

        dispatch({ type: 'SET_PROCESSING', payload: true });
        try {
            const root = await state.saveDirectoryHandle.getDirectoryHandle('ShotPacks', { create: true });
            const batchName = `BATCH-${Date.now()}`;
            const batchDir = await root.getDirectoryHandle(batchName, { create: true });

            const manifest: {
                app: string;
                exportedAt: string;
                batch: string;
                shotCount: number;
                shots: Array<{ id: string; name: string; folder: string; startFrame: boolean; endFrame: boolean }>;
            } = {
                app: 'NBStoryBoard',
                exportedAt: new Date().toISOString(),
                batch: batchName,
                shotCount: shots.length,
                shots: [],
            };

            for (let i = 0; i < shots.length; i++) {
                const shot = shots[i];
                const shotName = sanitizeName(shot.name || `Shot_${i + 1}`);
                const folderName = `SHOT-${String(i + 1).padStart(2, '0')}-${shotName}`;
                const shotDir = await batchDir.getDirectoryHandle(folderName, { create: true });

                const promptForShot = compileV3DirectorPrompt(shot.director, shot.referenceSlots, shot.tokens);

                const pack = {
                    app: 'NBStoryBoard',
                    exportedAt: new Date().toISOString(),
                    shot: {
                        id: shot.id,
                        name: shot.name,
                        createdAt: shot.createdAt,
                        updatedAt: shot.updatedAt,
                        notes: shot.notes || '',
                        index: i + 1,
                    },
                    director: shot.director,
                    anchorDNA: {
                        environment: shot.director.environment,
                        lighting: shot.director.lighting,
                        camera: shot.director.camera,
                    },
                    compiledPrompt: promptForShot,
                    stage: {
                        backgroundUrl: shot.backgroundUrl || null,
                        tokens: shot.tokens,
                        annotations: shot.annotations,
                        referenceSlots: shot.referenceSlots,
                    },
                    frames: {
                        start: shot.startFrameUrl ?? null,
                        end: shot.endFrameUrl ?? null,
                    }
                };

                await writeFileToDir(shotDir, 'shot.json', new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
                await writeFileToDir(shotDir, 'prompt.txt', new Blob([promptForShot || ''], { type: 'text/plain' }));

                if (shot.backgroundUrl) await writeDataUrlPng(shotDir, 'background.png', shot.backgroundUrl);
                if (shot.startFrameUrl) await writeDataUrlPng(shotDir, 'start.png', shot.startFrameUrl);
                if (shot.endFrameUrl) await writeDataUrlPng(shotDir, 'end.png', shot.endFrameUrl);

                const refsDir = await shotDir.getDirectoryHandle('refs', { create: true });
                const activeRefs = getActiveReferenceSlots(shot.referenceSlots);
                for (const r of activeRefs) {
                    if (!r.url) continue;
                    await writeDataUrlPng(refsDir, `ref_${r.index}.png`, r.url);
                }

                const tokensDir = await shotDir.getDirectoryHandle('tokens', { create: true });
                for (const t of shot.tokens) {
                    if (!t.url) continue;
                    const tag = t.tag || t.id;
                    await writeDataUrlPng(tokensDir, `token_${sanitizeName(tag)}.png`, t.url);
                }

                await exportRegionEditAssets(shotDir, shot.regionEdit, dispatch);

                manifest.shots.push({
                    id: shot.id,
                    name: shot.name,
                    folder: `ShotPacks/${batchName}/${folderName}`,
                    startFrame: !!shot.startFrameUrl,
                    endFrame: !!shot.endFrameUrl,
                });
            }

            await writeFileToDir(batchDir, 'manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));

            dispatch({ type: 'ADD_LOG', payload: { message: `Exported ALL shot packs: ShotPacks/${batchName}`, type: 'success' } });
        } catch (e: unknown) {
            dispatch({ type: 'ADD_LOG', payload: { message: `Export ALL shot packs failed: ${getErrorMessage(e)}`, type: 'error' } });
        } finally {
            dispatch({ type: 'SET_PROCESSING', payload: false });
        }
    }, [dispatch, state]);

    return {
        handleSaveActiveShot,
        handleExportActiveShotPack,
        handleExportAllShotPacks,
        handleExportDiagnostics
    };
};

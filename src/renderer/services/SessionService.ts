import type {
    AppState,
    StageToken,
    StageAnnotation,
    Shot,
    DirectorSettings,
    RegionEditState,
    HistorySnapshot,
    ReferenceSlot,
    FloorPlane,
    OccupiedVolume
} from '../context/AppContext';
import type { ShotSession } from '../types/shots';

export interface SessionPayload {
    version: string;
    timestamp: number;
    sessionName: string | null;
    state: {
        tokens: StageToken[];
        annotations: StageAnnotation[];
        shots: Shot[];
        director: DirectorSettings;
        regionEdit: RegionEditState;
        backgroundUrl: string | null;
        depthMapUrl: string | null;
        depthMapHash: string | null;
        sourceBackgroundHash: string | null;
        floorPlane: FloorPlane | null;
        occupiedVolumes: OccupiedVolume[];
        activeShotId: string | null;
        resultImage: string | null;
        historyPast: HistorySnapshot[];
        historyFuture: HistorySnapshot[];
        referenceSlots: ReferenceSlot[];
        shotSessionsBySceneId: Record<string, ShotSession>;
    }
}

export const SessionService = {
    VERSION: '1.0.0',

    exportSession(state: AppState): string {
        const payload: SessionPayload = {
            version: this.VERSION,
            timestamp: Date.now(),
            sessionName: state.sessionName || 'Untitled Session',
            state: {
                tokens: state.tokens,
                annotations: state.annotations,
                shots: state.shots,
                director: state.director,
                regionEdit: state.regionEdit,
                backgroundUrl: state.backgroundUrl,
                depthMapUrl: state.depthMapUrl,
                depthMapHash: state.depthMapHash,
                sourceBackgroundHash: state.sourceBackgroundHash,
                floorPlane: state.floorPlane,
                occupiedVolumes: state.occupiedVolumes,
                activeShotId: state.activeShotId,
                resultImage: state.resultImage,
                historyPast: [], // Omit history to prevent "Invalid string length" out-of-memory crash!
                historyFuture: [], // Omit history to prevent "Invalid string length" stringify crash!
                referenceSlots: state.referenceSlots || [],
                shotSessionsBySceneId: state.shotSessionsBySceneId || {}
            }
        };
        
        // Cycle-safe serialization in case of accidental React Fiber nodes or DOM references in state
        const cache = new Set();
        const jsonString = JSON.stringify(payload, (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) {
                    console.warn(`[SessionService] Removed circular reference at key: ${key}`);
                    return undefined;
                }
                cache.add(value);
            }
            return value;
        }, 2);
        
        return jsonString;
    },

    parseSession(json: string): Partial<AppState> | null {
        try {
            const payload = JSON.parse(json) as SessionPayload;
            if (!payload.state) return null;

            // Extract only the properties we want to overwrite in AppState
            const loadedState: Partial<AppState> = {
                sessionName: payload.sessionName,
                tokens: payload.state.tokens || [],
                annotations: payload.state.annotations || [],
                shots: payload.state.shots || [],
                director: payload.state.director,
                regionEdit: payload.state.regionEdit || undefined,
                backgroundUrl: payload.state.backgroundUrl || null,
                depthMapUrl: payload.state.depthMapUrl || null,
                depthMapHash: payload.state.depthMapHash || null,
                sourceBackgroundHash: payload.state.sourceBackgroundHash || null,
                floorPlane: payload.state.floorPlane || null,
                occupiedVolumes: payload.state.occupiedVolumes || [],
                activeShotId: payload.state.activeShotId || null,
                resultImage: payload.state.resultImage || null,
                historyPast: payload.state.historyPast || [],
                historyFuture: payload.state.historyFuture || [],
                referenceSlots: payload.state.referenceSlots || [],
                shotSessionsBySceneId: payload.state.shotSessionsBySceneId || {}
            };

            return loadedState;
        } catch (e) {
            console.error("Failed to parse session file:", e);
            return null;
        }
    }
};

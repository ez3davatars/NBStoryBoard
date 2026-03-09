import type { AppState, StageToken, StageAnnotation, Shot, CastMember, PropItem, DirectorSettings, RegionEditState, HistorySnapshot, WardrobeItem } from '../context/AppContext';

export interface SessionPayload {
    version: string;
    timestamp: number;
    sessionName: string | null;
    state: {
        tokens: StageToken[];
        annotations: StageAnnotation[];
        shots: Shot[];
        actorLibrary: CastMember[];
        wardrobeItems: WardrobeItem[];
        propItems: PropItem[];
        director: DirectorSettings;
        regionEdit: RegionEditState;
        backgroundUrl: string | null;
        depthMapUrl: string | null;
        depthMapHash: string | null;
        sourceBackgroundHash: string | null;
        floorPlane: any | null; // FloorPlane type
        occupiedVolumes: any[]; // OccupiedVolume type
        activeShotId: string | null;
        resultImage: string | null;
        historyPast: HistorySnapshot[];
        historyFuture: HistorySnapshot[];
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
                actorLibrary: state.actorLibrary,
                wardrobeItems: state.wardrobeItems,
                propItems: state.propItems,
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
                historyPast: state.historyPast,
                historyFuture: state.historyFuture
            }
        };
        return JSON.stringify(payload, null, 2);
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
                // Carefully merge Actor Library. Perhaps we shouldn't overwrite the global one entirely?
                // But for a full "Session" restore, usually we do want the exact project state.
                actorLibrary: payload.state.actorLibrary || [],
                wardrobeItems: payload.state.wardrobeItems || [],
                propItems: payload.state.propItems || [],
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
                historyFuture: payload.state.historyFuture || []
            };

            return loadedState;
        } catch (e) {
            console.error("Failed to parse session file:", e);
            return null;
        }
    }
};

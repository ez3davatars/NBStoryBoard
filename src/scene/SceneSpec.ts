export type SceneSpec = {
    version: "1.0"

    camera: CameraSpec
    frame: FrameSpec
    actors: ActorSpec[]
}
export type CameraSpec = {
    mode: "static"          // start with static only
    angle: "eye-level" | "low" | "high"
    distance: "close" | "medium" | "wide"
    lens: "35mm" | "50mm"
    lock: true              // hard rule: camera may not reframe
}
export type FrameSpec = {
    aspectRatio: "16:9" | "9:16" | "1:1"
    horizonY: number        // 0–1 normalized
    groundPlaneY: number   // 0–1 normalized
}
export type ActorSpec = {
    id: string

    boundingBox: {
        x: number            // 0–1 normalized (left)
        y: number            // 0–1 normalized (top)
        width: number        // 0–1 normalized
        height: number       // 0–1 normalized
    }

    depthLayer: 0 | 1 | 2 | 3
    cameraZone: "foreground" | "midground" | "background"

    scaleLock: true
    positionLock: true

    plane: "grounded" | "floating"

    occlusion: {
        mayOcclude: string[]
        mayBeOccludedBy: string[]
    }

    poseLock: boolean
}
export const createEmptySceneSpec = (): SceneSpec => ({
    version: "1.0",
    camera: {
        mode: "static",
        angle: "eye-level",
        distance: "medium",
        lens: "50mm",
        lock: true
    },
    frame: {
        aspectRatio: "16:9",
        horizonY: 0.5,
        groundPlaneY: 0.68
    },
    actors: []
})

import { create } from "zustand"
import { createEmptySceneSpec } from "./SceneSpec"
import type { SceneSpec, ActorSpec } from "./SceneSpec"

type SceneSpecState = {
    scene: SceneSpec

    setScene: (scene: SceneSpec) => void
    addActor: (actor: ActorSpec) => void
    updateActor: (id: string, patch: Partial<ActorSpec>) => void
    removeActor: (id: string) => void
}

export const useSceneSpec = create<SceneSpecState>((set) => ({
    scene: createEmptySceneSpec(),

    setScene: (scene: SceneSpec) => set({ scene }),

    addActor: (actor: ActorSpec) =>
        set((state) => ({
            scene: {
                ...state.scene,
                actors: [...state.scene.actors, actor]
            }
        })),

    updateActor: (id: string, patch: Partial<ActorSpec>) =>
        set((state) => ({
            scene: {
                ...state.scene,
                actors: state.scene.actors.map((a) =>
                    a.id === id ? { ...a, ...patch } : a
                )
            }
        })),

    removeActor: (id: string) =>
        set((state) => ({
            scene: {
                ...state.scene,
                actors: state.scene.actors.filter((a) => a.id !== id)
            }
        }))
}))

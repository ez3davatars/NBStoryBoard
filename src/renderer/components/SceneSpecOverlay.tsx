import React from "react"
import { useSceneSpec } from "../../scene/useSceneSpec"

const SceneSpecOverlay: React.FC = () => {
    const { scene } = useSceneSpec()
    const actors = scene.actors

    console.log("Scene actors:", actors)

    return (
        <div className="pointer-events-none absolute inset-0 z-[9999]">
            {actors.map((actor) => {
                const { x, y, width, height } = actor.boundingBox

                return (
                    <div
                        key={actor.id}
                        className="absolute border-2 border-red-500 bg-red-500/10"
                        style={{
                            left: `${x * 100}%`,
                            top: `${y * 100}%`,
                            width: `${width * 100}%`,
                            height: `${height * 100}%`
                        }}
                    />
                )
            })}
        </div>
    )
}

export default SceneSpecOverlay


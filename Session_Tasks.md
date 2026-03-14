# Virtual Try-On Fixes

- [x] Preserve generated state between navigation
  - [x] Identify component for Virtual Try-On (`WardrobeStudio`)
  - [x] Move state to a higher level or use global store (`AppContext` via `WardrobeState`) for images and view toggle
- [x] Change background color of generated views
  - [x] Find where the images are rendered (`WardrobeStudio`)
  - [x] Apply black background styling
  - [x] Apply black background styling

- [x] Fix Reference Stack drag-and-drop
  - [x] Investigate Chromium IPC failure for Wardrobe turnaround base64 objects 
  - [x] Switch `application/json` drag payload to only transport the asset ID, resolving the parse failure
  - [x] Enhance drop handlers in `SceneCanvas.tsx` to reverse-lookup from global state
  - [x] Disable native HTML `<img>` drag events during data transfer to skip Chromium's automatic ghost image render crashing on multi-MB strings.

- [x] Fix Capture Stage Downloads
  - [x] Separate stage image and depth map downloads by 600ms to bypass browser 'multiple file' request cancellation.

- [x] Fix Reference DNA Analysis
  - [x] 'Deadline Expired' error was triggered by massive stitched 4K turnaround base64 payloads to the Gemini endpoint.
  - [x] Extracted a 1024px inline canvas downscale guardian into `GeminiService._resolveImageData`, shielding **all** vision API endpoints globally from uncompressed data URI timeouts.

- [x] Fix Storyboard OOM Crash (V8 JavaScript Heap)
  - [x] Adding/loading shots performs a deep `clone()` of the AppContext state (Tokens, RefSlots, Backgrounds) to build history snapshots.
  - [x] When tokens contain Wardrobe's multimegabyte uncompressed Base64 arrays, `structuredClone` copies the physical string exponentially into V8 memory until it overflows and crashes Electron.
  - [x] Refactored `clone()` into `smartClone()`, which traverses the state object but explicitly passes >500b `data:image/...` strings by reference instead of deep copying them, solving the leak.

- [x] Restore "Add Shot" button to Staging
  - [x] Investigated `ShotListPanel.tsx` and found it was accidentally unmapped from the Staging sidebar `panelOrder`.
  - [x] Re-injected `"shots"` into `SceneCanvas.tsx`'s sidebar layout tree and defaulted it to visible.

- [x] Fix Production Console Scene Render Text Resolution Blur
  - [x] Upgraded the Global Guardian `GeminiService` threshold from restrictive `1200px` to expansive `3072px` with aggressive JPEG encoding. Placed explicit 1024 throttles purely on the lightweight DNA queries, maximizing visual scene detail.

- [x] Fix Staging "Shot Load" UI Freeze
  - [x] Investigated the "UI becomes unresponsive when loading an old shot" React runtime crash. 
  - [x] Realized that legacy shots saved before recent app upgrades lacked newly added array properties (like `occupiedVolumes`). This forced Redux reducers to assign `undefined` which caused `.map()` to throw a hard fatal exception in the Staging view.
  - [x] Fortified `AppContext.tsx` core reducers to robustly fallback to `|| []` whenever missing legacy properties are encountered.
  
- [x] Fix "Hard Crash / Impossible to Close" when switching Shot Items 
  - [x] The user reported the entire UI thread locked up and couldn't even be closed using the title bar.
  - [x] Identified two extremely severe edge-cases inside the `AppContext` data ingestion pipeline when evaluating historical/malformed states.
  - [x] Fixed an unhandled `TypeError` inside `deduplicateTokens` which blindly invoked `.toFixed(2)` on coordinates `t.x` and `t.y`. If a legacy shot contained corrupted tokens, React blew up completely, killing the Custom Title Bar.
  - [x] Prevented the `smartClone` recursive function from attempting to individually copy millions of indices inside `Uint8ClampedArray` binary objects. Hardened it to immediately return any `ArrayBuffer` by reference.

- [x] Fix Storyboard "Start Plate" Not Loading Automatically
  - [x] When clicking "New Shot" from the Staging area, the `ADD_SHOT_FROM_STAGE` action was creating the shot object but leaving `startFrameUrl` as `null` until manually captured.
  - [x] Refactored `addShotFromStage` in `SceneCanvas.tsx` to automatically trigger `captureAndSetShotFrame` upon shot creation, immediately populating the newly generated shot with the visual state.
  - [x] Modified `captureAndSetShotFrame` to accept a direct `targetId` bypass to perfectly avoid asynchronous React closure states during instantiation.

- [x] Fix Storyboard Monitor Ghost Plates
  - [x] The user observed that deleting all shots would leave the last visual image permanently frozen on the Storyboard Program Monitor.
  - [x] Identified that the `REMOVE_SHOT` reducer handled removing the array items but didn't structurally wipe `state.storyboardSource`.
  - [x] Updated the Redux logic. If `REMOVE_SHOT` deletes the final available shot, it now aggressively `null`s out the master Storyboard sources. Otherwise, it forcefully synchronizes the global target plates with the `startFrameUrl` and `endFrameUrl` of the very next consecutive active shot.

- [x] Enable Scene Generator Anchor Linking from Storyboard
  - [x] The user requested the ability to funnel generated/stored frames out of the Storyboard Reference Stack and directly into the Scene Generator.
  - [x] Evaluated the `VeoMonitorPanel` visual hover overlay which handles plate loading.
  - [x] Injected a "Set as Scene Anchor" button alongside the existing Target load. Clicking it dispatches `SET_BG` for `currentStartUrl` (or End), bridging the visual data directly into the left Staging panel.

- [x] Fix Scene Generator Anchor Image Hallucinations
  - [x] The user attempted to generate an "Extreme Close Up" using an Anchor Image and "Scene Lock", but the Scene Generator returned a completely hallucinated identity.
  - [x] Discovered that `generateBg` inside `SceneCanvas.tsx` did not pass the `state.backgroundUrl` as a reference image to Gemini, nor did it format the `state.director.sceneLock` or `mergeStrategy`. 
  - [x] Rewrote `generateBg` to dynamically append the Anchor Image and strict Scene Lock directives to the final prompt payload sent to `GeminiService.generateImage`.

- [x] Fix Scene Generator Reference Integration
  - [x] The user attempted to use "Replace Anchor Subjects" with a turnaround sheet in the Reference Stacks, but the AI hallucinated the character.
  - [x] Evaluated `generateBg` again and realized it entirely ignored `state.referenceSlots`.
  - [x] Imported `getActiveReferenceSlots` into `SceneCanvas` and mapped active Reference Stacks into the `GeminiService.generateImage` references array alongside the anchor image, ensuring character consistency during Scene generation.
  - [x] Modified `generateBg` to inject a `CRITICAL OVERRIDE FOR POSES` that aggressively forbids the AI from adopting the Reference Image's neutral expression, mandating it perfectly assumes the exact facial expression and bodily posture of the person in the Anchor Scene.

- [x] Inject Anchor Depth Map into Scene Generation
  - [x] The user noted the AI was not maintaining the actual spatial positioning of subjects from the Anchor Scene (i.e. bringing a background subject into the foreground instead of moving the camera).
  - [x] Implemented a check in `generateBg` for `state.depthMapUrl`.
  - [x] If available, the depth map is now explicitly injected as an `ANCHOR_SCENE_DEPTH_MAP` reference image, accompanied by systemic structural constraints forcing the AI to respect occlusion and spatial layout.

- [x] Fix Scene Generator Focal Perspective Hallucination
  - [x] Discovered that when requesting a "Close Up" of a Scene Anchored image, the AI interpreted it as "enlarge the subject but paste the exact identical pixels of the original wide-angle background behind them". 
  - [x] This broke the depth map constraints, as the subject wrongly occupied the 3D space of the foreground instead of zooming the camera into the original position.
  - [x] Overhauled the Gemini Prompt logic in `SceneCanvas.tsx` with a strict `LOCK_SCENE & CAMERA DYNAMICS` block. The AI is now explicitly ordered to dynamically crop and zoom the background plane to realistically accommodate the new lens focal length, maintaining the physical scale ratio established by the Reference Depth Map.
  - [x] To permanently stop text-to-image override hallucinations when "Scene Lock" is active, restructured the `generateBg` prompt to quarantine the user's manual text prompt inside a strict `STYLISTIC REQUEST` sub-clause, forcing the AI to evaluate the spatial locks first.

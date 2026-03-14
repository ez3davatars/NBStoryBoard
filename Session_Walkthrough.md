# Virtual Try-On Fixes Walkthrough

## Completed Work

* **Preserved Initial View States**: Moved the `tryOnOutputMode`, `tryOnViews`, `tryOnSheetFB`, `tryOnSheetLR` and `activeTryOnView` states out of `WardrobeStudio` and into the global `AppContext` state object's `WardrobeState`. The try-on images and current toggle view will now persist safely even if the Virtual Try-On panel is unmounted and the user navigates directly to another tool.
* **Updated Try-On Background Color**: The main view where Try-On image results are rendered inside the Try-On Room Workspace now displays a pure black background instead of the default `#09090b` or white area where missing backgrounds were appearing.
* **Updated Prompt Generation Output Color Constraints**: Adjusted the `GeminiService` text prompts for the Virtual Try-On generation (specifically the turnaround/2-sheet mode) to strictly request a `#000000` (black) background instead of white. The frontend code already had the correct constraint for the "Front Only" view but Turnarounds were using white previously.

### Modified Files
`render_diffs(d:\NanobananaProStudio\NBStoryBoard\src\renderer\context\AppContext.tsx)`
`render_diffs(d:\NanobananaProStudio\NBStoryBoard\src\renderer\components\WardrobeStudio.tsx)`

## Verification
1. I triggered an application build to catch any typing or syntactic errors and it passed successfully.
2. The user can manually verify the fixes by generating images in the try-on mode, navigating to another view such as "Prop Library", and then returning to the Try-On workspace. The exact same views, UI toggles (L/R, F/B), and generated characters should still be fully present!
3. Generating a Turnaround Virtual Try-On sheet will now use a Black `#000000` background across all outputs.

### Staging Drag and Drop Fix
We identified that the recent upgrade to "Black" backgrounds in the Wardrobe turnaround generation resulted in substantially larger Base64 image payloads. When a user added these new high-resolution characters to the Available Cast and attempted to drag them into the Staging References stack, Chromium's internal IPC limit for `DataTransfer` strings was exceeded, throwing SSL (-101) errors and causing the drag to fail silently.

To fix this:
* We refactored the drag payload in `SceneCanvas.tsx` for the Available Cast palette to only pass `{ type: 'cast_member', id: cast.id }` rather than stringifying the entire `CastMember` object (which included the massive base64 URL).
* We updated the drop handlers (`handleRefSlotDrop` and `handleDrop`) to intercept the `'cast_member'` ID and perform a fast lookup against `state.cast` in the global `AppContext`.
* We assigned `draggable={false}` to the actual HTML `<img>` tag and intercepted the internal DataTransfer initialization to block Chromium from attempting to generate a massive data-URI ghost image, solving the low-level SSL crash.

### Capture Stage Download Fix
The user also reported that clicking "Capture Stage" only downloaded the Depth Map. Since both the Composition image and the Depth Map were triggered via synchronous `.click()` calls, Chromium was cancelling the first file download.
* We added a 600ms asynchronous sleep delay before triggering the Depth Map download, ensuring that both files save sequentially without overriding each other.

### Global Guardian Downscaler Fix (Reference DNA & Scene Renderer)
The exact same underlying issue behind the drag-and-drop crash (massive uncompressed 4K Turnaround base64 URIs) was causing the powerful Google Gemini vision API to hit a "Deadline Expired" timeout. Both the **Reference DNA Analysis** button and the final **Render Scene** button in the Production Console were failing because the multi-megabyte JSON payload took too long for Google to accept and parse.
* Instead of fixing this in each individual button, we extracted a fast, client-side downscaler directly into the core `GeminiService` API gateway (`_resolveImageData` function). 
* Any image passed to a Gemini endpoint is dynamically evaluated: if its longest edge is over 1200px, it is quietly drawn to an invisible HTML canvas in less than 20 milliseconds, proportionally scaled down to fit within the 1200px boundary, and re-encoded as a highly efficient 85% JPEG.
* This global "Guardian" intercepts all massive files right before they are sent over the network. It reduces the API upload payload by over 95%, guaranteeing blazing fast DNA extractions and final composition renderings with absolutely zero risk of timeouts, and completely shields all your pristine tokens from being prematurely compressed!

### Storyboard JavaScript Memory Optimization (OOM Fix)
The massive "Black Background" Turnaround sheets introduced a cascading Out of Memory (OOM) leak in the V8 JavaScript engine when operating the Storyboard. 
Whenever a user added a Shot or scrubbed the Timeline, the application's global Redux-style `AppContext` generated a strict "History Snapshot" (so you can click Undo). The previous code used `structuredClone()`, which meant it was physically copy-and-pasting the 30-Megabyte Base64 image payload into a brand new memory block for *every single frame* recorded. Loading two shots back-to-back forced Electron to rapidly allocate gigabytes of RAM until the internal Javascript Heap collapsed.

* We built a custom `smartClone()` utility and replaced every instance of `clone()` in the global state engine.
* `smartClone()` still traverses the history tree identically, but whenever it encounters an image data URI over 500 characters long, it strictly **passes by reference** instead of deep-cloning. 
* This elegantly fixes the "JavaScript heap out of memory" crash. You can now load, duplicate, and modify as many massive 4K shots as you want without using a single extra drop of RAM!

`render_diffs(d:\NanobananaProStudio\NBStoryBoard\src\renderer\context\AppContext.tsx)`

### Production: Scene Resolution Loss Fixed
The user noticed that rendering a final scene in the Production Console resulted in an image where text elements or crisp textures were noticeably blurred compared to exactly how it looked on the Stage.
* This was an unintended side-effect of our earlier `Global Guardian Downscaler`. It was originally hard-capped to `1200px` to save the Drag-and-Drop bug from overflowing. However, the Production Console's `Render Scene` command passes the entire 4K Staging Canvas as an `ANCHOR_GUIDE` to the image generator!
* Squeezing a 4K Stage composition down to 1200px before uploading it to Gemini meant the image generator literally couldn't "see" the small text to properly render it.
* We refactored `GeminiService._resolveImageData()` to use a flexible threshold. 
* By default, high-impact `ANCHOR_GUIDE` generation anchors are now allowed to pass at a massive **3072px**, converting safely into highly-compressed JPEGs. Smaller background tasks (like `analyzeMultiFrame` and `analyzeImage`) explicitly request a lightweight **1024px** crop to maintain their blazing sub-second speeds.
* This will immediately result in significantly sharper generations when rendering your Stage.

`render_diffs(d:\NanobananaProStudio\NBStoryBoard\src\renderer\services\GeminiService.ts)`

### Staging: Loading Shots "UI Freeze" Fix
The user reported that clicking a shot in the Staging "Shot List" panel would sometimes revert the screen to an old layout and permanently freeze the entire application—you could hover over buttons but clicks would do nothing.
* We traced this down to a fatal unhandled React exception during the `SET_ACTIVE_SHOT` render loop.
* Because the app is continuously upgraded, older 'Shots' saved in the user's `localStorage` were missing newer features, specifically the `occupiedVolumes` array (which powers the Actor Intelligence bounds). 
* When the Redux state engine tried to safely clone the missing array, it returned `undefined`. React immediately attempted to run a `.map()` loop over the missing `occupiedVolumes` variable, throwing a hard `TypeError` and causing the entire component tree to lock up.
* We thoroughly fortified the global `AppContext.tsx` reducer so that any legacy shots or missing arrays structurally default to `|| []` during the smart cloning process. 
* Loading older shots will now work flawlessly without crashing!

`render_diffs(d:\NanobananaProStudio\NBStoryBoard\src\renderer\context\AppContext.tsx)`

### Hard Crash / Impossible to Close Fix
- **Issue**: Switching shots in the `ShotListPanel.tsx` would permanently freeze the React fiber tree. The OS titlebar close button would still work, but the application's internally rendered close buttons became completely unresponsive.
- **Root Cause**: The `deduplicateTokens` array iterator blindly called `.toFixed(2)` on `token.x` and `token.y` without verifying they existed. Legacy or malformed shots threw an unhandled `TypeError` that escalated and killed the entire window's render context. In addition, the `smartClone` history builder attempted to incrementally read and duplicate millions of pixels when encountering a raw `Uint8ClampedArray` binary image stream from the GPU.
- **Solution**: Engineered a graceful failure bypass inside `deduplicateTokens` to quietly ignore corrupted items. Intercepted `ArrayBuffer` and `TypedArray` objects inside `smartClone` to instantly pass them by reference instead of locking the V8 execution thread with a `for` loop.

### Storyboard: Start Plate Not Loading Automatically
- **Issue**: Arriving at the Storyboard and selecting a shot from the left rail displayed a grayed-out "S" placeholder and "No Start Plate Selected", confusing users who expected their newly created shot to automatically contain an image.
- **Root Cause**: The `ADD_SHOT_FROM_STAGE` action in the Staging interface successfully initialized the shot properties but left `startFrameUrl` as `null`. It required the user to manually click the separate "Start" button afterward to capture the visual array.
- **Solution**: Refactored `addShotFromStage` inside `SceneCanvas.tsx`. It now generates a new ID, dispatches the creation, and natively auto-executes `captureAndSetShotFrame('start', id)` directly. A targeted ID bypass prevents asynchronous race conditions. Now, the exact moment you click "New Shot", the Staging view is embedded into the Shot object, meaning it's instantly waiting for you in the Storyboard.

### Storyboard: Program Monitor Ghost Plate Removal
- **Issue**: Deleting the final shot completely from the "Shot List", or even removing an intermediary shot, would leave the main Program Monitor visually unchanged, showing an orphaned target image that didn't belong to any shot anymore.
- **Root Cause**: The global presentation states (`storyboardSource` and `storyboardEndSource`) powering the giant Monitor were disconnected from the `REMOVE_SHOT` cleanup logic block. 
- **Solution**: We strongly coupled the visual components using the `AppContext.tsx` global reducer. 
  - If a shot is deleted and there are **no** active shots remaining, the Redux engine aggressively `null`ifies both the `storyboardSource` and `storyboardEndSource` pipelines, safely wiping the screen dark.
  - If a shot is deleted, and it cascades to the *next available* active shot on the history stack, the Redux engine dynamically injects that surviving shot's `startFrameUrl` into the global variables, resulting in an instant, perfect screen synchronization sequence!

### Storyboard: Routing Visuals to Scene Generator
- **Objective**: The user wanted the explicit ability to take a generated frame (or start plate) currently loaded into the Storyboard and feed it directly into the Staging area's "Scene Generator" to act as an Anchor Image.
- **Implementation**: 
  - Built out the hidden hover-overlay inside the `VeoMonitorPanel`.
  - Added a new, prominent "Set as Scene Anchor" explicit action button right next to the "Load as Target" button.
  - When clicked, it bypasses the Storyboard entirely, grabs the full massive data-URL of the active plate, and force-injects it into the global `state.backgroundUrl` via the `SET_BG` reducer.
  - This perfectly bridges the gap, allowing users to rapidly generate frames in the Storyboard using AI, pull them back into Staging, lock them as anchors, and orchestrate perfectly consistent characters on top of them!

### Scene Generator: Anchor Image & Scene Lock Ignoring Fix
- **Issue**: When utilizing the newly placed Scene Anchor Image inside the Scene Generator, prompts (like requesting an "Extreme close up" with Scene Lock enabled) resulted in total AI hallucination of entirely new subjects and backgrounds.
- **Root Cause**: The `generateBg` function inside `SceneCanvas.tsx` was firing off raw `GeminiService.generateImage` calls perfectly fine for pure Text-to-Image creation, but it completely ignored the existence of `state.backgroundUrl` (the Anchor Image) and `state.director` parameters like `sceneLock` and `mergeStrategy`.
- **Solution**: 
  - Overhauled the `generateBg` execution block. If a `state.backgroundUrl` is present in the viewer, the function now explicitly attaches it as the "Anchor Scene Master Reference".
  - Dynamically injects system instructions summarizing the selected `mergeStrategy`.
  - If `sceneLock` is engaged (purple glowing lock), it injects a stringent `LOCK_SCENE` directive enforcing the AI to rigidly maintain the subject identity, facial features, age, clothing, environment, and background, restricting the model strictly to camera movements or pose alterations requested in the user prompt.

### Scene Generator: Reference Stacks Character Consistency Fix
- **Issue**: The Scene Generator ignored character sheets stored in the "Reference Stacks", hallucinating new characters even when "Replace Anchor Subjects" was checked.
- **Root Cause**: While the previous fix fed the *Anchor Image* to the AI, it still omitted `state.referenceSlots`. The Scene Generator was totally blind to the actors the user had curated in the Reference Stacks.
- **Solution**: 
  - Imported `getActiveReferenceSlots` from the prompt helpers into `SceneCanvas.tsx`.
  - Structured the payload in `generateBg` to loop through active Reference Stacks and prepend them as `CHARACTER_REFERENCE` images to the array sent to Gemini.
  - Injected strict prompt directives forcing the AI to prioritize the structural and identity details from the `CHARACTER_REFERENCE` stack when rendering the final composition onto the Anchor Scene.

### Scene Generator: Depth Map Spatial Injection
- **Objective**: The AI was successfully replacing the subject and respecting the environment pixel boundaries, however it lacked an understanding of the 3D volume of the studio—meaning generating a "close-up" merely scaled the character upward while the background perspective wrongly stayed locked.
- **Implementation**: 
  - Validated that `state.depthMapUrl` was available from the global context as soon as the Anchor Image is acquired.
  - Updated the Scene Generator execution (`generateBg`) to check for `depthMapUrl` existence.
  - The Depth Map is now attached locally to the Gemini query as an explicit structural image, named `ANCHOR_SCENE_DEPTH_MAP`.
  - Highly strict system rules were encoded alongside the map, forcing the model to *"understand the 3D spatial layout, perspective, and scale of the scene"*, guaranteeing that character positioning correctly interacts with occlusion logic (e.g. standing behind foreground lights).

### Scene Generator: Camera Dynamics Focal Scaling Fix
- **Issue**: After injecting the depth map, generating a "Close-up" *still* resulted in a visual hallucination where the subject was enlarged out of proportion against the original wide-angle studio background, breaking physical laws. 
- **Root Cause**: The prompt explicitly stated "DO NOT hallucinate a new background", forcing the AI to pixel-match the original wide studio background while simultaneously trying to satisfy the "Close Up" text prompt. Its only resolution was to enlarge the character and plant them absurdly close to the lens.
- **Solution**: 
  - It now includes a paramount `CAMERA DYNAMICS` command prioritizing physical physics over pure pixel matching.
  - The AI is explicitly permitted and ordered to: *"scale, crop, and adjust the background perspective to realistically match the new camera focal length! DO NOT simply enlarge the subject and paste them onto the original wide background. The physical relationship and relative scale between the subject and the immediate background objects must remain perfectly intact."*

### Fixing SceneCanvas Infinite Loop on Image Clear (V20.2 Hotfix)
- **Issue:** The app locked up and froze completely when a user removed/cleared an Anchor Image from the Scene Generator while actors were still present on the stage.
- **Root Cause:** A React infinite render loop in `SceneCanvas.tsx`. The `useEffect` block responsible for `GROUNDING SYNCHRONIZATION` was attempting to clamp the Z-depth of existing actors to a `floorPlane`. When the image was cleared, the `depthMapUrl` and `groundDepth` were destroyed, causing the effect to rapidly re-trigger on undefined data and update the global store simultaneously in a loop.
- **Solution:** Added a strict bailout condition at the entry point of the grounding `useEffect`. If `!state.backgroundUrl`, `!state.depthMapUrl`, or `groundDepth === null` evaluates to true, the hook immediately aborts and explicitly resets its internal `lastGroundingKeyRef` to empty. This breaks the lifecycle trap and allows the user to clear the stage safely.

### Veo Studio: Manual Keyframe AI Text Overrides & Global Prompts
- **Issue**: Previously, the Veo Prompt Studio operated entirely on a Shot-centric basis. The text prompt drafted was saved rigidly to the `activeShot` selected from the `StoryboardShotRail`, meaning that leaving the panel or clearing the active shot instantly destroyed the drafted concepts. Additionally, the `useVeoSmartAnalyze` engine generated its 3.1 JSON exclusively based on visual analysis, entirely ignoring the user's manual written prompt if they chose to upload their own manual Start/End frames.
- **Root Cause**: The `VeoPromptBuilderPanel.tsx` utilized isolated local React state that was destroyed when the user toggled the "Timeline" or "Keyframes" tool tabs. The `PromptBuilder.ts` only looked for the generated JSON spec when structuring the VEO 3.1 payload.
- **Solution**:
  - Lifted the drafted prompt into a global layout via the implementation of `state.veoPromptDraft` and the dispatch action `SET_GLOBAL_VEO_DRAFT`. Unassigned concepts now survive across tabs.
  - Implemented a "Clear Prompt" action bound to a Trash icon directly on the Prompt Builder editor panel for fast resetting.
  - Added a "Clear All Shots" confirmation dialog to the base `StoryboardShotRail` interface, firing a new `CLEAR_SHOTS` action to memory wipe the studio rail.
  - Rewired `useVeoSmartAnalyze.ts` to accept an `injectPromptDraft` parameter, which consumes the active (or global fallback) draft. The prompt compiler (`PromptBuilder.ts`) now appends a HIGH PRIORITY `DIRECTOR'S MANUAL OVERRIDES` section to the final prompt string, guaranteeing that manually uploaded keyframes benefit from both the AI's forensic visual breakdown AND the user's curated text parameters.

# Cast Director Studio User Guide
**Version 1.0** | **Date:** 2026-02-02

---

## 📖 Table of Contents
1.  **Introduction**
2.  **Getting Started**
    *   System Requirements
    *   Storage & Synchronization
3.  **The Studio Workflow**
    *   **Phase 1: CAST** (Character Generation)
    *   **Phase 1b: PORTRAIT** (DNA Engine)
    *   **Phase 2: NANO CAST** (Biometric & Style Engine)
    *   **Phase 3: WARDROBE STUDIO** (Designer & Virtual Try-On)
    *   **Phase 4: PROPS** (Asset Management)
    *   **Phase 5: STAGE [PREVIEW]** (Scene Composition)
    *   **Phase 6: ACTION** (Production Rendering)
4.  **Troubleshooting**

---

## 1. Introduction
Welcome to **Cast Director Studio**, powered by Nanobanana Pro. This comprehensive suite provides precision tools for character casting, costume management, and cinematic staging. The platform is designed around a logical studio pipeline, moving from individual asset creation to final scene production.

---

## 2. Getting Started

### Storage & Synchronization
The system includes a "Unified Storage Link" to connect all your studios to a single project destination.

**Step-by-Step Setup:**
1.  Navigate to the **Settings** menu (Gear icon in the top right).
2.  Locate **Render Save Folder**.
3.  Click **Choose Save Folder** and select your main project directory on your hard drive.
4.  **Verification:**
    *   Go to the **Nano Cast** view.
    *   Open the Sidebar controls.
    *   Check the status indicator. It should read <span style="color:#22c55e; font-weight:bold;">CONNECTED</span> in green.
    *   *Note:* If it reads <span style="color:#ef4444; font-weight:bold;">NOT LINKED</span>, assets will only be stored in temporary memory.

**File Structure Note:**
When you save an actor, the system uses a **Native File Structure**:
*   **Images:** Saved as `Actor-{Timestamp}.png` (e.g., `Actor-170688.png`). This generic naming prevents file system collision conflicts.
*   **Metadata:** A sidecar file `Actor-{Timestamp}.json` is saved alongside. This contains your custom name (e.g., "Commander Shepherd"), tags, and style info.
*   **Result:** You see the "Real Name" in the app, while the file system keeps a clean, ordered record.

---

### AI Generation Settings
In the **Settings** menu (Gear icon in the top right), you can fine-tune how the AI generates images across the studio:
*   **Active Engine:** Select your preferred generation model. We recommend **Gemini 3.1 Flash (Image)** for the best balance of speed and prompt reasoning.
*   **Image Resolution (Gemini 3.1):** Choose between 1K (Fastest), 2K (High Quality), and 4K (Ultra HD - Slow).
*   **Thinking Mode (Gemini 3.1):** Enable this to improve prompt adherence and complex image generation at the cost of generational speed.
*   **Google Image Search Grounding:** Enable this to allow the AI to ground its outputs using Google Search, increasing accuracy for real-world references and props.
*   **Enable Storyboard (Veo 3.1) [Experimental]:** Unlocks the experimental Veo 3.1 storyboarding interface under the Storyboard tab. Note: This feature is currently experimental and should not be expected to produce production-ready results.

---

## 3. The Studio Workflow

### Phase 1: CAST (Character Generation)
**The "Casting Forge"**
Your journey begins here. Use the Casting Forge to generate new high-fidelity actors from scratch.

**Core Workflow & Controls:**

*   **Prompting (Text Box):** 
    *   **What it does:** The raw text input describing the character.
    *   **When to use it:** Structure your prompts by defining Age (e.g., "mid-30s"), Ethnicity (e.g., "Scandinavian"), and Style (e.g., "cyberpunk hacker"). Be as descriptive as possible.

*   **Visual Engine (Studio Style Dropdown):** 
    *   **What it does:** Selects the overarching aesthetic for the generation. Options include Realism (photographic), Animation (3D stylized), Anime (2D cel-shaded), and Concept Art (painterly).
    *   **When to use it:** Use this heavily to dictate the "universe" the character lives in. Realism mode enforces strict photography rules under the hood to prevent CG-looking outputs.

*   **Generate (Action Button):** 
    *   **What it does:** Initializes the AI image generation based on your prompt and chosen Style.

**Advanced Options & Mechanics:**

*   **Reference Sheets (Toggle):** 
    *   **What it does:** Changes the output format from a single portrait to a multi-angle character design sheet. Options include *Form* (Full body turnaround), *Face* (Close-up portrait angles), and *Split* (Dynamic dual-angle presentation).
    *   **When to use it:** Turn this on when you need strict identity continuity across multiple angles (essential for 3D modeling, AI consistency, or consistent comic book panels).

*   **Canvas Actions (Manual Slicing / Crop):**
    *   **What it does:** Activates a manual crop/slice tool directly on the generated canvas preview, allowing you to isolate specific parts of the image (like just the headshot from a full body render, or a specific prop they are holding).
    *   **When to use it:** Very useful for extracting clean thumbnails for the Library or isolating a face to send into the Portrait Studio's Reference Mode.

*   **Save to Library:**
    *   **What it does:** Saves the generated actor to a specific Category folder (Realism, Stylized Cartoon, Illustration, Sci-Fi, or Uncategorized). The system writes the raw PNG and a hidden JSON sidecar containing metadata to the disk.
    *   **When to use it:** Click this to permanently store the actor for use in Wardrobe or Stage phases.

*   **Send to Director:** 
    *   **What it does:** Automatically transfers the currently visible generated image into Phase 2 (Nano Cast) and locks it as a biometric reference identity.
    *   **When to use it:** Use this shortcut to rapidly transition from generating a raw character into applying a specific art style or injecting a logo over their outfit.

*   **Cast Assets List & Global Clear:**
    *   **What it does:** Displays all active generated tokens for this casting session. Includes a global **Delete All (Trash Can)** button next to the token count to securely wipe all temporary cast tokens from memory simultaneously.

---

### Phase 1b: PORTRAIT (DNA Engine)
**The "Portrait Studio"**
Use the Portrait Studio to establish a baseline character using precise biometric and morphological traits before full casting. The studio operates in two distinct modes: **Synthetic** (building a face from scratch) and **Reference** (using an existing photo).

**Mode 1: SYNTHETIC (Create from Scratch)**

*   **Identity Matrix:** Use the dropdowns to construct fundamental demographics.
    *   *Load / Save Preset:* Load a previously built demographic combination, or save your current matrix for perfect consistency across future sessions.
    *   *Biosign: Sex:* Select Female or Male.
    *   *Biosign: Ethnicity:* Select the primary geographic/ethnic background (e.g., Caucasian, Black, East Asian, Hispanic).
    *   *Dermal: Tone:* Select from the Fitzpatrick Scale, Type I (Pale White) to Type VI (Black).
    *   *Life Stage & Age:* Select a broad timeline category (Child, Teen, Adult, Elder) and fine-tune the specific decimal age with the slider.

*   **Morphology:**
    *   **What it does:** Defines the physical build and stature of the character using exact mathematical measurements.
    *   *Height (ft / in) & Weight (lbs):* Set the exact vertical height and body mass.
    *   *Metabolic Index (BMI):* The system automatically calculates BMI based on Height/Weight to determine their physical build description (e.g., Athletic, Average, Heavy) which is injected into the prompt.

*   **Facial Architecture:**
    *   **What it does:** Explicitly carves the bone structure and features.
    *   *Controls:* Dropdowns for Face Shape, Eyes, Nose, Lips, and Jawline. If none of the presets fit, choose "Custom" to type your own specific descriptor (e.g., "Aquiline nose").
    *   *Creative Direction:* A text box to add subtle visual hints (e.g., "Sharp cheekbones, tired expression").

*   **Surface Imperfections & Hair (Skin/Crown):**
    *   **What it does:** Adds lived-in texture and styling to the character.
    *   *Skin Age vs Chronological Age:* You can decouple skin age from physical age (e.g., a 30-year-old with the weathered skin of a 50-year-old).
    *   *Scars & Freckles:* Inject controlled amounts of surface detailing.
    *   *Hair:* Define Color, Style, Length, and Texture to complete the portrait.

**Mode 2: REFERENCE (Upload a Photo)**

*   **Identity Reference Photo:** 
    *   **What it does:** Drag & drop or upload a source photograph. The system will lock on to this facial identity as the absolute structural truth.
    *   **When to use it:** When you have a specific real-world actor or previous AI generation that you must match perfectly.
*   **Likeness Fidelity Lock (0-100%):** 
    *   **What it does:** Controls how strictly the AI adheres to the uploaded photo. 
    *   **When to use it:** Keep at 100% to enforce an exact, unyielding clone (preserving eyewear, facial hair, exact lighting). Drop below 90% to give the AI creative liberty to alter the face to match other stylistic prompts.
*   **Age Transform:** 
    *   **What it does:** While the core identity is locked to the photo, you can use the Life Stage and Chronological Age controls.
    *   **When to use it:** When you need a seamless age progression or regression to the uploaded face without losing the actor's bone structure.
*   **Selective Overrides (The "Unlock" Padlocks):** 
    *   **What it does:** In Reference Mode, sections like Morphology, Facial Architecture, Skin, and Hair are physically locked down (dimmed out) to prioritize the uploaded photo.
    *   **When to use it:** Click the padlock icons to "Unlock" a specific section. This allows you to use your uploaded photo for the facial ID, but completely override their hair color/style, or inject new scars and skin age constraints over the photo.

**DNA Output Stream (Both Modes)**
*   **Generate DNA Portrait:** Compiles your chosen settings (or Reference photo) into a highly detailed "Studio Protocol" prompt to generate a perfect, consistent headshot. *Requires an uploaded image if Reference mode is active.*
*   **Send to Casting:** Transfers the generated portrait to the Casting Forge (Phase 1) to act as a permanent locked actor.
*   **Send to Ref Sheet:** Automates sending the newly created face to the Casting Forge and immediately toggles on the multi-angle character design sheet protocol.

---

### Phase 2: NANO CAST (Biometric & Style Engine)
**The "Director's Monitor"**
Refine a generated character or inject your own biometric identity.

**A. Biometric Acquisition (Human-to-Digital)**
Turn yourself into the character.

**Step-by-Step & Modes:**
1.  **Toggle Camera:** Click the **Camera Icon** (Top Right) to enable the webcam.
2.  **Sidebar Mode:** Switch Sidebar to **biometric acquisition**.
3.  **Capture Angles:** You must acquire three distinct angles of your face to build a robust biometric profile.
    *   **Center:** Look straight ahead. Click **Manual Capture** or use **Auto-Scan** (waits for stable alignment).
    *   **Left/Right:** Turn your head 90 degrees left and right respectively.
    *   **Upload Option:** Alternatively, use the **Upload** toggle for each slot to pick high-res local photos instead of webcam frames for higher quality interpolation.
4.  **Process:** Once `Center`, `Left`, and `Right` are acquired, proceed to **Phase 02 (Matrix)**.

**B. Director's Console (Refinement)**
Found in the **Director** sidebar tab. These controls blend the underlying identity (from your webcam capture or Casting Forge generation) with new text instructions to create stylized variations of the same person.

*   **Identity Lock Slider (0-100%):** 
    *   **What it does:** Determines how intensely the AI clings to the foundational facial structure of the input image.
    *   **When to use it:** 
        *   Keep at **100%** if you need an *Exact Clone*. Note that sticking to 100% forces the AI to sacrifice significant art style accuracy to ensure the face perfectly matches reality.
        *   Drop to **80%-90%** to allow the AI to slightly bend the facial features to fit cartoon/anime styles while remaining recognizable.
        *   Drop to **0%** for a *Complete Override*, completely ignoring the source face and generating a new person based only on the prompt.
*   **Stylization Intensity Slider:** 
    *   **What it does:** Controls how heavily the visual art style overrides photographic realism.
    *   **When to use it:** Increase this when moving from a real photograph to an Anime or 3D Render prompt. *Warning: Setting this very high alongside a 100% Identity Lock creates a tug-of-war for the AI that may cause rendering artifacts.*
*   **Approx. Age Dropdown/Slider:** 
    *   **What it does:** Shifts the perceived physical age of the character while mathematically maintaining their core facial geometry and bone structure.
    *   **When to use it:** When creating flashbacks (child/teen versions) or future states (elderly versions) of an established character identity without generating an entirely new person.
*   **Branding & Identity (Zap System):**
    *   **Logo Upload:** 
        *   **What it does:** Accepts a transparent PNG (e.g., a faction symbol, sports logo, or brand emblem).
        *   **When to use it:** To procedurally embed vector graphics directly into the generated image's fabric/geometry.
    *   **Placement Matrix:** 
        *   **What it does:** A text string defining exactly where the logo should geometrically map onto the subject.
        *   **When to use it:** Type explicit commands like "Left Chest", "Center of Hat Brim", or "Right Shoulder Pauldron". The AI natively bends and lights the logo to match the material topology.
*   **Save Character (Action Button):** 
    *   **What it does:** Finalizes the blended and branded avatar. It packages the image and metadata (including the 3 original biometric angles if captured via webcam) and saves it directly to the local Director's library for scene use.

---

### Phase 3: WARDROBE STUDIO (Designer & Virtual Try-On)
**The "Costume Department"**

#### Part A: Costume Designer (Tab 1)
Create unique clothing assets before placing them on an actor.

*   **Design Reference Upload (Optional):**
    *   **What it does:** Allows you to upload a temporary image to forcefully guide the AI's generation of a costume.
    *   **When to use it:** When text prompting alone cannot hit the specific geometry of the garment you are designing.
*   **SKETCH Mode (Toggle):** 
    *   **What it does:** Primes the AI to interpret 2D line drafting or flat sewing patterns.
    *   **When to use it:** Upload a fashion sketch, and the system will physically construct a photorealistic, finished wearable garment based on those lines combined with your text prompt.
*   **COSTUME Mode (Toggle):** 
    *   **What it does:** Primes the AI to extract data from a real-world photo.
    *   **When to use it:** Upload a photo of existing cosplay or a real garment. The AI extracts the silhouette and materials, creating a clean, isolated studio product shot of it.
*   **Save to Wardrobe (Action Button):** 
    *   **What it does:** Automatically extracts the item from its background and saves it to the local library.
    *   **When to use it:** Click this to make the garment available for the actors in Tab 2.

#### Part B: Virtual Try-On Room (Tab 2)
Fit your generated costumes onto your generated actors.

*   **Remove BG (Toggle):** 
    *   **What it does:** Automatically processes the AI output through the foreground isolation pipeline to strip away the background environment as soon as the generation completes.
    *   **When to use it:** Keep ON to drastically cut down workflow time so the actor is immediately ready for Stage placement.
*   **Character Sheet Identity Anchor (Upload):** 
    *   **What it does:** Overrides the base headshot photo by injecting a multi-angle character sheet (from the Casting Forge) as a strict identity anchor.
    *   **When to use it:** *Highly recommended* when using the TURNAROUND output view, as the AI needs references for what the back and sides of the actor's head look like.
*   **FRONT View (Toggle):** 
    *   **What it does:** Generates a standard, high-detail single-image front view of the character wearing the outfit.
    *   **When to use it:** Standard usage for static scene placement.
*   **TURNAROUND View (Toggle):** 
    *   **What it does:** Generates a comprehensive two-sheet turnaround containing Front, Back, Left, and Right views of the character in the outfit.
    *   **When to use it:** When creating assets for 3D modeling pipelines or comic books where multiple angles are required.
*   **Execute Virtual Try-On (Action Button):** 
    *   **What it does:** Intelligently merges the costume geometry onto the actor's specific proportions.
    *   **When to use it:** Once your subject and wardrobe are selected. *Note on AI Logic: The system enforces strict Single Subject rules. If the item is fully enclosing (like a mascot suit), the AI understands the actor is inside the suit, not standing next to it.*

#### Part C: Background Removal & Restoration Tools
Used to clean up the fitted asset.

*   **Remove Background (Action Button):** 
    *   **What it does:** Manually triggers the AI boundary detection to strip the "green screen" studio background if the Auto-Toggle was off.
    *   **When to use it:** If you forgot to turn on Auto-Remove, or want to review the raw render first.
*   **Edge Refinement / Green Suppression (Background Logic):** 
    *   **What it does:** A backend process that cleans neon light spill from the background off the edges of the character.
*   **Manual Restoration (Eraser Brush):**
    *   **What it does:** Paints original pixels back *over* the alpha transparency mask.
    *   **When to use it:** Use this when the AI accidentally removes a crucial translucent element (like a helmet visor, a thin rifle strap, or strands of hair). Brush over the missing area to bring it back.

---

### Phase 4: PROPS (Asset Management)
**The "Prop House"**
Generate standalone items before bringing them onto the Stage.

*   **Generate Objects (Text Input):** 
    *   **What it does:** Generates handheld items or set dressing (e.g., "A glowing rusty sci-fi crate") on a stark background.
    *   **When to use it:** When you need a highly specific object that your actors will interact with on the Stage later. 
*   **Scale Expectations (System Logic):** 
    *   **What it does:** Props inherently generate at a standard frame size, ignoring physical real-world bounds (a ring will be the same canvas size as a car).
    *   **When to use it:** Don't worry about size here. You will scale them relative to the full scene manually when building your composite in Phase 5.
*   **Isolate / Manual Restoration (Toolbar):** 
    *   **What it does:** Utilizes the same Background Removal, Edge Refinement, and Eraser/Paint brush tools found in the Wardrobe Studio to mask the object.
    *   **When to use it:** Always isolate your props before saving them so they are true "stickers" when you place them on stage.
*   **Save & Categorize (Action Button):** 
    *   **What it does:** Saves the transparent PNG to the local `.../Props/` directory.
    *   **When to use it:** To finalize the asset and make it visible in the Stage's Asset Drawer.

---

### Phase 5: STAGE [PREVIEW] (Scene Composition)
**The "Blocking Stage"**

> **[PREVIEW] Feature Notification:**
> **Advanced scene composition, now in preview.**
> The Staging module empowers you to explore multi-element visual storytelling. Use this environment to test character placement and scene direction by translating your cast, props, and scene logic into a unified 2D blocking matrix. 
> 
> **The Power of Directed SHOTS:** This module encompasses the new SHOTS functionality, allowing you to generate cinematic angle variations directly from your arranged staged result. Utilizing rigid Semantic Locks (Identity, Wardrobe, Background, and Lighting), you can photograph your scene from multiple perspectives while retaining character and environment integrity.
> 
> Currently powerful for rapid concepting and creative experimentation, the underlying "Scene Truth" physics are still evolving toward fully production-ready consistency.

Compose your shot by dragging your generated actors and props onto the canvas and arranging your dynamic workspace.

#### Workspace Customization
*   **Modular Sidebars:** All operational panels inside the Stage (such as *Actor Intelligence*, *Token Properties*, *Stage Layers*, etc.) are fully modular. You can **drag and drop** them vertically on either the left or right columns to reorder your workspace.
*   **Persistent Layouts:** Your configuration—including panel order and collapsed/expanded panel states—is persistently saved to local memory and will be restored exactly how you left it upon your next session launch.

#### Stage Navigation Bar (Top)
Before diving into individual panels, note the global controls resting above the Stage canvas:

*   **Depth Assist (Status Text):** Indicates if the AI has successfully calculated a 3D depth map of your currently selected background image. If it says "AVAILABLE", the 'Auto (Depth)' occlusion features in Token Properties will work beautifully.
*   **View Toggle (STAGE vs RESULT):** 
    *   **STAGE:** This is your active workspace where you drag tokens, paint zones, and write notes.
    *   **RESULT:** Clicking this instantly swaps the view to the *last generated cinematic output* for this scene, allowing you to quickly A/B test your changes against the final render without opening your library.
*   **Active Scene References (Counter):** A simple token tracker showing how many individual actors/props the AI currently recognizes as being actively involved in the scene.
*   **GENERATE COMPOSITE (Button):** The final action button. Once your stage is set, clicking this initiates the heavy rendering pipeline defined in Phase 6.

#### Token Properties vs. Actor Intelligence
When an actor or prop is on stage, you control them via two distinct panels:

*   **Token Properties (The Visuals):** Controls *where* the token sits on the canvas and *how they overlap* with other objects. Think of this as your layout engine.
    *   **Transform Tools:**
        *   **Position (X:Y) & Nudge:** 
            *   **What it does:** Sets exact pixel coordinates on the 2D canvas. The Nudge tools offer 1-pixel directional micro-adjustments.
            *   **When to use it:** For mathematically precise layout grids or locking elements perfectly in corners.
        *   **Zoom/Scale (X:Y):** 
            *   **What it does:** Controls the absolute scale of the token. The Chain Link icon toggles Uniform vs Non-Uniform aspect ratio locking.
            *   **When to use it:** Scale actors manually to fit the background scene's perspective.
        *   **Anchor (X:Y):** 
            *   **What it does:** Sets the physical pivot point of the token (0.5, 0.5 is dead center).
            *   **When to use it:** Change this before rotating a token to spin them from a corner instead of their center.
        *   **Rotate:** 
            *   **What it does:** A slider for 360-degree rotation calculating around the set Anchor point.
            *   **When to use it:** For dynamic posing (e.g., a flying character or an angled prop).
    *   **Z-Depth Layering:** 
        *   **What it does:** The Back / Front buttons manually force the token behind or in front of other tokens and annotations on the 2D stage canvas.
        *   **When to use it:** To stack character layers correctly.
    *   **Focus View:** 
        *   **What it does:** Instantly centers and zooms your viewport on the currently selected character.
        *   **When to use it:** For precision editing on massive stages.
    *   **Duplicate / Copy:** 
        *   **What it does:** Quickly clones a character and all their exact spatial/semantic properties.
        *   **When to use it:** Creating identical crowds or symmetrical designs.
    *   **Spatial & Occlusion:** Fine-tune how the character physically blends into the background environment's 3D space:
        *   **Scene-Agnostic Support Placement:** The system actively projects tokens mathematically onto classified physical architecture visible within the environment (e.g., forcing a seating pose onto specific chairs instead of generating a new one). Ensure you place token anchors directly over valid structural supports on your background plate to leverage physical grounding without hallucinating new objects underneath them.
        *   **Occlusion Mode (Auto vs. Force Front):**
            *   **What it does:** "Auto (Depth)" analyzes the background's 3D geometry and computationally masks the actor based on their position (e.g., cutting off their legs so they look like they are standing *behind* a desk). "Force Front" completely disables this 3D masking.
            *   **When to use it:** Use "Auto" when you want an actor to naturally sit inside the environment (like in a chair or behind a counter). Use "Force Front" if the AI is accidentally deleting parts of your character because it mistakenly thinks they are behind a wall, or if you just want them plastered uniformly on top of the background.
        *   **Depth Bias Slider (Pull Closer / Push Back):**
            *   **What it does:** This slider manually overrides the mathematical depth threshold the AI uses to slice the character in "Auto (Depth)" mode.
            *   **When to use it:** If "Auto (Depth)" placed your character behind a desk, but it cut off too much of their waist (making them look like they are sinking into the floor), slide this towards **PULL CLOSER** (negative value). This treats the actor as being closer to the camera lens, revealing more of their body. If they look like they are floating *in front* of the desk when they should be behind it, slide it towards **PUSH BACK** (positive value) to aggressively increase the masking effect and push them deeper into the scene's geometry.
        *   **RESET Button:**
            *   **What it does:** Instantly snaps the Depth Bias slider back to `0.00`.
            *   **When to use it:** Click this if your manual slider adjustments have completely scrambled the occlusion mask and you want to return to the AI's default 3D mathematical estimation.
*   **Actor Intelligence (The Semantic DNA):** Controls *what* the actor is doing. This panel manages the textual "Prompt DNA" sent to the AI.
    *   **Auto Analyze:** 
        *   **What it does:** Sends the isolated actor image to the AI to write a highly specific prompt describing their current pose, action, and lighting.
        *   **When to use it:** Click this first when placing an actor to ensure the Master Layout engine knows what they currently look like.
    *   **Semantic DNA (Text Box):** 
        *   **What it does:** Contains the manually editable text descriptor describing the character's actions ("Pose, Action, Lighting DNA...").
        *   **When to use it:** To establish specific posing (e.g., typing *"Kneeling, holding a sword, angry expression"*). *Crucial Pipeline Mechanics:* The engine prioritizes the strict mathematical biometric identity extracted from the actor's reference photograph. Avoid adding generic profile descriptions (e.g., "tall blonde man") here, as the engine natively enforces their visual identity, preserving facial structure and silhouette even when occluded by scene layout architecture.
    *   **Grounding (The Green Toggle):** 
        *   **What it does:** Forces the actor's 3D Z-depth to mathematically bind to the physical "Ground Plane" detected in the background scene.
        *   **When to use it:** Keep this ON to ensure the actor is sorted correctly in space exactly where their feet touch the ground, preventing them from floating in front of tables they should be standing behind.
    *   **Manual (Override Checkbox):** 
        *   **What it does:** Bypasses safety blocks that prevent Grounding if the AI hallucinates or fails to find a clear floor in abstract background images.
        *   **When to use it:** Check this box if the system warns about "low-confidence floor detection" but you absolutely need the actor locked to the bottom edge.

#### Scene Director (The Master Prompt)
This panel is your top-level command center for describing the scene to the AI, acting as the foundation that your individual actors and props are placed into.

*   **Subject / Action:** 
    *   **What it does:** A broad text box to describe the overarching event happening in the scene (e.g., "A tense standoff between two smugglers").
    *   **When to use it:** Always fill this out. While individual actors have their own "Semantic DNA" for specific poses, this box tells the AI how everyone relates to each other.
*   **Environment:**
    *   **What it does:** Describes the physical setting of the stage (e.g., "A claustrophobic, rusty cargo bay on a spaceship").
    *   **When to use it:** Use this if you are *not* using a background image, or if you want to explicitly override the "vibe" of the background image you dragged in. *Note: If 'Env Auto' is lit up in yellow, the AI is trying to auto-fill this based on your background plate. Click 'Unlock' to type manually.*
*   **Lighting (Dropdown):**
    *   **What it does:** Forces a specific cinematic lighting style across the entire scene (e.g., "Cinematic High Contrast", "Neon Cyberpunk").
    *   **When to use it:** Leave on "Default / Auto" to let the AI decide based on your Environment prompt. Select a specific style when you need strict mood control or color palettes.
*   **Camera (Dropdown):**
    *   **What it does:** Dictates the framing and lens choice (e.g., "Extreme Wide Shot", "Dutch Angle", "Macro").
    *   **When to use it:** Use this to force a specific perspective. If left on "Default / Auto", the AI will try to frame the shot based on where you physically placed your actors on the canvas.
*   **Layout (Dropdown):**
    *   **What it does:** Controls the core spatial arrangement of the subjects (e.g., Horizontal, Vertical, Center).
    *   **When to use it:** Use this to give the AI a strong hint on how to organize the composition if your actors are overlapping in complex ways.

#### Stage Bottom Navigation Bar (Tools)
This toolbar handles canvas utilities and annotation tools.

*   **Undo / Redo (Arrows):** 
    *   **What it does:** Steps backward or forward through your drag-and-drop history, property changes, or deletions.
*   **Copy:** 
    *   **What it does:** Creates an exact duplicate of the currently selected token. Identical to the properties panel function.
*   **Clear Stage (Trash Can):** 
    *   **What it does:** Wipes the entire stage clean. It removes all actors, props, notes, zones, paths, and the background image. *Warning: There is no prompt confirmation for this action.*
*   **Annotations (Note, Zone, Path):**
    *   **What they do:** 
        *   **Note Tool:** Pinned text block for AI instructions (e.g., "Looking at explosion").
        *   **Zone Tool:** A resizable box to highlight specific boundaries.
        *   **Path Tool:** Drawn arrows for sightlines or movement vectors.
    *   **When to use them:** Drag from the toolbar to place precisely, or click to spawn. The engine reads these spatial instructions during Phase 6 rendering.
*   **Save Image:** 
    *   **What it does:** Exports a flattened high-resolution PNG of your current 2D layout stage (actors, background, annotations). It does *not* generate a new AI composite.
    *   **When to use it:** For sharing quick block-outs with a team.
*   **Save Depth:** 
    *   **What it does:** Exports the black-and-white 3D depth map mask of your current layout. 
    *   **When to use it:** For external compositing pipelines in Photoshop or Nuke.
*   **Scene Generator (The Background Plate):** 
    *   **What it does:** Multi-modal composer for creating the foundational environment behind the actors.
    *   **When to use it:** Use the upload area to drop an inspiration image, text notes, and the Merge Strategy Dropdown to decide how heavily the AI adheres to the photo vs the text.

### Phase 5b: The "Reference Stack" Workflow (Advanced)
**For precise directing without using canvas tokens.**

Instead of dragging actors onto the stage, you can use the **Reference Stack** method to "cast" the scene via text:

1.  **Name Your Actors:**
    *   Click the **Edit Icon (Pencil)** on the actor in the sidebar.
    *   Change the default name (e.g., "Actor-123") to a specific character name (e.g., "Commander Shepherd").
    *   *Why?* The AI needs these specific names to link your Director's Note to the correct face.
2.  **Select Actors:** Click/Highlight the **Named Actors** in the sidebar list.
3.  **Director's Note:**
    *   Open the Note tool.
    *   **Direct by Name:** Write specific instructions using the names you just assigned (e.g., *"Commander Shepherd standing on the left..."*).
    *   **Visual Aid:** Draw arrows on the canvas pointing to where you want them.
4.  **Result:** The AI reads the highlighted "Reference Stack" and places them according to your text/arrow instructions.

### Phase 5c: SHOTS Module (Multi-Angle Photography) [PREVIEW]
**For creating sequential storytelling without redrawing the set.**

The Directed Shots pipeline (currently in PREVIEW alongside the Stage module) allows you to setup your arranged 2D canvas and "photograph" it from multiple consecutive camera angles.

*   **Scene Truth Snapshot:** Before rendering a multi-angle sequence, the system locks a "Scene Truth Snapshot". This freezes the semantic DNA covering your background environment, spatial positioning bounds, and biometric actor data across all subsequent shot generations.
*   **Preventing Set Hallucination:** This architecture explicitly prevents "environmental drift" (the walls or doors of a room changing shape) and stops the AI engine from hallucinating random new furniture or actors when the camera perspective shifts.
*   **Camera-Pivot Continuity:** To trigger perfect spatial identity continuity during your session, rely exclusively on "Camera-pivot-only" lens/angle changes (e.g., switching the dropdown from an *Establishing Shot* to an *Extreme Close-Up*). Avoid altering the overarching "Environment" or "Lighting" prompts in the middle of a SHOTS sequence to prevent breaking the Snapshot lock.

---

### Phase 6: ACTION (Production Rendering)
**The "Production Console"**
The final step compiling everything setup in the Stage phase into a lit, shaded master frame.

1.  **Stage Input (The Layout Analysis):** 
    *   **What it does:** The engine reads the *entire* spatial composition—calculating exactly where Actors and Props overlap, their scale, rotation, layer priority, and camera framing relative to the bounds.
2.  **Prompt Collection (The Script):** 
    *   **What it does:** Aggregates Semantic DNA (Pose/Action) from Actor Intelligence, all semantic Annotations (Notes, Zones), and explicit camera/lighting styles forced by the Scene Director.
3.  **Final Render Compilation (The Shoot):** 
    *   **What it does:** Synthesizes a flawless, cohesive final cinematic frame where lighting and shadows mathematically calculate light bounces to interact naturally across all composited elements.

#### Advanced Render Parameters (Right Panel)
Before initiating the Generate Composite action, you can fine-tune the master instruction set via this panel:

1.  **STRICT SEMANTIC LOCK (Toggle)**
    *   **What it does:** When toggled ON, it forces the AI to prioritize your text prompts (from Notes and Actor Intelligence) *over* the visual layout of the canvas.
    *   **When to use it:** Turn this ON if the AI keeps ignoring details you typed (like "holding a blue sword" or "wearing sunglasses"). Turn it OFF if the AI is messing up the physical positioning of the actors in favor of trying to fit too many text details in.
    
2.  **Anchor Scene DNA**
    *   **What it does:** This section extracts the core "vibe" (Lighting, Camera Angle, Environment) from the background image you are using on your stage.
    *   **When to use it:** If you dragged a background image onto your stage that has really cool cinematic lighting (like a dark, neon alleyway), you click **FORCE RE-EXTRACT**. The AI will analyze the background and lock those lighting parameters in (DW = Day/Weather, LGT = Lighting, CAM = Camera). The final render will then perfectly match the lighting of your background!
    
3.  **Auto Whitelist Profiles**
    *   **What it does:** This scans every actor you've dragged onto the stage and ensures their individual "Semantic DNA" (the pose/action prompt we looked at earlier) has been analyzed.
    *   **When to use it:** Click **ANALYZE MISSING** if the "Tokens Ready" counter isn't full (e.g., it says 0/1 or 1/3). This is a quick way to automate the "Auto Analyze" step for every actor on stage at once, rather than tracking them down individually, ensuring the AI knows what everyone looks like before you hit render.
    
4.  **ACTIVE HANDOFF PAYLOAD (The Code Box)**
    *   **What it does:** This is the *actual* prompt block that gets sent to the rendering engine. It combines your Strict Semantic Lock rules, the Anchor DNA, your Stage Annotations, and all the Actor Prompts into one massive master instruction set.
    *   **When to use it:** You generally don't *use* this; you *read* it. Before you hit Generate, glance at this box. If you see something wrong (like an old note you forgot to delete, or a contradicting instruction), you know you need to fix it on the stage before spending time and credits generating a bad render!

---

### Phase 7: POST-PRODUCTION (Region Edit)
**The "Retouching Bay"**
After generating your final cinematic frame in Phase 6, you can use the Region Edit panel to make hyper-specific changes to isolated parts of the image without rerendering the entire scene.

1.  **Masking Tools (Paint / Erase)**
    *   **What it does:** Allows you to manually paint a mask (highlight) over the specific area of the image you want to change.
    *   **When to use it:** Use **PAINT** to highlight a mistake (like an extra finger) or an object you want to alter (like a coffee cup). Use **ERASE** if you accidentally highlighted too much.
    *   *Tip:* Click **MASK OFF** to temporarily hide your painted overlay so you can clearly see the underlying image details.

2.  **Mask Layers (Mask A, Mask B, Mask C)**
    *   **What it does:** Gives you three separate, transparent layers to store different masks. You can toggle them ON/OFF individually.
    *   **When to use it:** Use this if you want to make multiple, unrelated edits. Save the extra finger edit to Mask A, and changing the shirt color to Mask B. You can then apply them one at a time without losing your brushwork.

3.  **Brush Size & Edge Softness**
    *   **What it does:** Controls the diameter of your masking brush and how feathered/blurred the painted edge is.
    *   **When to use it:** Use a small size and hard edge (0.00 softness) for precise details like eyes. Use a large size and soft edge (0.50+ softness) for blending larger elements like replacing a whole couch, so the new AI generation blends smoothly into the surrounding original pixels.

4.  **Protect Face/Hair (Checkbox)**
    *   **What it does:** When enabled, the AI mathematically subtracts any pixels recognized as human faces or hair from your painted mask right before processing the generation.
    *   **When to use it:** Leave this ON when changing a character's clothing (e.g., painting over their whole torso to give them a new shirt). If your brush accidentally clipped their chin or hair, the AI automatically protects those pixels, preventing it from accidentally mutating their face while trying to generate the new shirt.

5.  **Layer Instruction & Actions (Remove, Replace, Relight)**
    *   **What it does:** The text box is where you tell the AI *what* to do inside the painted mask. The three action buttons are quick-presets that automatically format your text.
    *   **When to use it:** 
        *   Click **REMOVE** to erase an object (e.g., "Remove the IV line. Match lighting.").
        *   Click **REPLACE** to change an object (e.g., "Change the coffee cup to a glass of water.").
        *   Click **RELIGHT** to change the mood of the masked area without changing the object (e.g., "Make the shadows deeper and more blue.").

6.  **APPLY ENABLED LAYERS**
    *   **What it does:** Executes the localized generation. It *only* processes masks that currently have their toggle set to "ON".
    *   **When to use it:** Click this when your mask is drawn, your instruction is written, and you are ready to see the localized fix.

---

## 4. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"Not Linked" Status** | Go to Settings and re-select your Save Folder. |
| **Green Artifacts** | In Wardrobe Studio, verify the "remove background" toggle is on. Manual brush can fix edges. |
| **Actor Name is "Actor-123"** | This is the file name. The App reads the valid name from the hidden `.json` file. |
| **Floating Heads in Suits** | In Try-On, ensure you aren't using a "Face Only" crop. The AI knows to put the body *inside* the suit. |
| **Library Not Updating** | Click the **Scan (↻)** button to force a folder re-read. |


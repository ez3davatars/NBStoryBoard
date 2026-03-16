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
    *   **Phase 5: STAGE** (Scene Composition)
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
Your journey begins here. Use the Casting Forge to generate new high-fidelity actors from scratch or import existing references.

**Core Workflow & Controls:**
1.  **Prompting:** 
    *   **Age:** Define chronological age (e.g., "mid-30s").
    *   **Ethnicity/Heritage:** Define overarching background (e.g., "Latina", "Scandinavian").
    *   **Style/Vibe:** Add descriptive keywords (e.g., "cyberpunk hacker", "distinguished royalty").
2.  **Visual Engine (Studio Style):** Select the overarching aesthetic from the dropdown:
    *   *Realism:* Photographic, cinematic output.
    *   *Animation:* 3D stylized (Pixar/Dreamworks style).
    *   *Anime:* 2D cel-shaded Japanese animation style.
    *   *Concept Art:* Painterly, loose brushwork aesthetic.
3.  **Generate:** Click the Action button to initialize the AI image generation.

**Advanced Options:**
*   **Reference Sheets:** Toggles generation format.
    *   *Form:* Full body turnaround.
    *   *Face:* Close-up portrait angles.
    *   *Split:* Dynamic dual-angle presentation.
*   **Canvas Actions (Manual Slicing):**
    *   Once an image is generated, you can use the built-in crop/slice tools directly on the canvas preview to isolate specific parts of the image (like a headshot or a specific prop).
*   **Save to Library:**
    *   Click **"Add to Library"**.
    *   Select a **Category** folder (e.g., *Realism*, *Sci-Fi*).
    *   The system saves the image file and creates a hidden JSON sidecar file containing your metadata to the selected folder (e.g., `.../Actors/Realism/Actor-170688.png`).
*   **Send to Director:** Automatically transfers the currently visible generated image into Phase 2 (Nano Cast) and locks it as the biometric reference identity.

---

### Phase 1b: PORTRAIT (DNA Engine)
**The "Portrait Studio"**
Use the Portrait Studio to establish a baseline character using precise biometric and morphological traits before full casting. The studio operates in two distinct modes: **Synthetic** (building a face from scratch) and **Reference** (using an existing photo).

**Mode 1: SYNTHETIC (Create from Scratch)**
*   **Identity Matrix:** Use the dropdowns to construct fundamental demographics.
    *   *Gender:* Male, Female, Androgynous.
    *   *Heritage:* Select the primary ethnic background.
    *   *Skin Tone (Fitzpatrick Scale):* Select from Type I (Pale) to Type VI (Deeply Pigmented).
*   **Life Stage & Age:**
    *   *Life Stage:* Select a broad category (Child, Teen, Adult, Elder).
    *   *Chronological Age Slider:* Fine-tune the specific age within that life stage.
*   **Morphology:** 
    *   Adjust the *Height* and *Weight* sliders.
    *   The system automatically calculates the character's Metabolic Index (BMI) to determine their physical build (e.g., Athletic, Average, Heavy) which is injected into the DNA prompt.

**Mode 2: REFERENCE (Upload a Photo)**
*   **Identity Reference Photo:** Drag & drop or upload a source photograph. The system will lock on to this facial identity as the absolute truth.
*   **Likeness Fidelity Lock (0-100%):** Controls how strictly the AI adheres to the uploaded photo. 
    *   *100%:* Enforces an exact, unyielding clone (preserving eyewear, facial hair, rendering style, and exact lighting).
    *   *Below 100%:* Allowing the percentage to drop gives the AI more creative liberty to alter the face to match other stylistic prompts while maintaining core bone structure.
*   **Age Transform:** While the core identity is locked to the photo, you can use the Life Stage and Chronological Age controls to apply a seamless age progression or regression to the uploaded face.
*   *(Note: In Reference Mode, basic morphology like height/weight is locked to prioritize the source image).*

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
Found in the **Director** sidebar tab. These controls blend the identity from your capture (or previous phase) with new prompt instructions.

*   **Identity Lock Slider (0-100%):** Determines how intensely the AI clings to the facial structure of the incoming actor. 
    *   *100%: Exact Clone.* The AI will sacrifice art style accuracy to ensure the face matches perfectly.
    *   *0%: Complete override.* The AI ignores the source face and generates a completely new person based only on the prompt.
*   **Stylization Intensity Slider:** Controls how heavily the visual art style overrides realism. Setting this high alongside a high Identity Lock creates a tug-of-war for the AI.
*   **Approx. Age Dropdown/Slider:** Shifts the perceived age of the character while attempting to maintain core facial geometry.
*   **Branding & Identity (Zap System):**
    *   **Logo Upload:** Upload a transparent PNG (e.g., a faction symbol, sports logo, or brand emblem).
    *   **Placement Matrix:** Type exactly where the logo should geometrically map onto the generated image (e.g., "Left Chest", "Center of Hat Brim", "Right Shoulder Pauldron"). The AI natively bends the logo to match the material topology.
*   **Save Character:** Finalizes the blended/branded avatar, packages the 3 angles and metadata, and saves it to the local library.

---

### Phase 3: WARDROBE STUDIO (Designer & Virtual Try-On)
**The "Costume Department"**

#### Part A: Costume Designer (Tab 1)
Create unique clothing assets from scratch or using references.

**Design Reference Types (Optional):**
You can upload an image to forcefully guide the AI's generation. This is a temporary "session only" reference.
*   **SKETCH Mode:** Select this if you are uploading a fashion sketch, line drafting, or flat sewing pattern. The AI will interpret the 2D drawing and physically construct a photorealistic, finished wearable garment based on those lines and your text prompt.
*   **COSTUME Mode:** Select this if you are uploading a photo of an existing real-world garment. The AI will extract the silhouette, materials, and overall look, creating a clean, isolated studio product shot of it.

**Step-by-Step:**
1.  **Reference (Optional):** Upload a Sketch or Costume photo.
2.  **Prompting:** Describe the outfit explicitly in the text box (e.g., "Tactical cyberpunk neon trench coat, ballistic weave").
3.  **Generate:** Creates the standalone clothing item on a stark black studio background.
4.  **Verify & Save:**
    *   **Save to Wardrobe:** Automatically extracts the item and adds it to the local `wardrobe` folder for the Virtual Try-On phase.
    *   **Download:** Exports the standalone generic image file.

#### Part B: Virtual Try-On Room (Tab 2)
Fit your generated costumes onto your generated actors.

**Try-On Setup & Controls (Right Panel):**
*   **Remove BG (Toggle):** When ON, drastically cuts down workflow time by automatically processing the AI output through the foreground isolation pipeline to strip away the background environment as soon as generation completes.
*   **Character Sheet (Identity Anchor):** Upload a previously generated character sheet (from the Casting Forge). This acts as a strict identity anchor, overriding the base photo and forcing the engine to remember exactly what the character's face looks like from all angles. *Highly recommended for Turnaround sheets.*
*   **Output Views:** 
    *   **FRONT (Single):** Generates a standard, high-detail single-image front view of the character wearing the outfit.
    *   **TURNAROUND (Multi):** Generates a comprehensive two-sheet turnaround containing Front, Back, Left, and Right views of the character in the outfit.
*   **Upload Sketch/Costume Shortcut:** A quick hyperlink to hop rapidly back to the Costume Designer tab if the current wardrobe isn't working.

**Step-by-Step Workflow:**
1.  **Select Subject:** Click an actor headshot from the "Selected Subject" row.
2.  **Select Wardrobe:** Click a costume from the "Active Wardrobe" list.
3.  **Configure Setup:** Set your desired **Output View** (Front or Turnaround) and upload a **Character Sheet** if you want to lock their identity.
4.  **Fitting Notes:** Add specific bespoke instructions that wouldn't be in the base item (e.g., "Sleeve rolled up", "Battle damaged", "Tucked in").
5.  **Execute Virtual Try-On:**
    *   The system intelligently merges the costume onto the actor's proportion.
    *   *System Logic:* It enforces strict **Single Subject** rules (No mannequins, no floating heads).
    *   *Mascot Suits:* If the item is fully enclosing (like a mech suit), the AI understands the actor is *inside* the suit, not sitting next to it.

#### Part C: Background Removal & Restoration Tools
Once a character is successfully fitted and generated:
1.  **Remove Background:** Click the toggle in the top right if you didn't auto-run it. The system uses AI boundary detection to strip the "green screen" studio background.
2.  **Edge Refinement (Green Suppression):** A backend process that cleans any neon light spill from the background off the edges of the character.
3.  **Manual Restoration (Eraser / Brush Tool):**
    *   Click the **Restore Brush** (Eraser Icon).
    *   **Paint** manually over areas of the image that the AI accidentally removed (e.g., a translucent helmet visor, a thin rifle strap, or strands of hair).
    *   This paints the original pixels back *over* the alpha transparency mask.
4.  **Save to Library:**
    *   Saves the **Processed Image** (Transparent BG) to the library.
    *   *Note:* The system always prioritizes saving your manually edited version over the original raw render if you made edits.

---

### Phase 4: PROPS (Asset Management)
**The "Prop House"**
Generate standalone items before bringing them onto the Stage.

*   **Generate Objects:** Describe handheld items or set dressing explicitly (e.g., "A glowing rusty sci-fi crate"). The AI generates these on a stark background.
*   **Scale Expectations:** Props generate at a standard size. You will scale them relative to actors manually later in Phase 5.
*   **Isolate (Background Removal):** Utilize the same Background Removal, Edge Refinement, and Manual Restoration brush tools found in the Wardrobe Studio to isolate the prop perfectly.
*   **Save & Categorize:** Saving the transparent PNG adds it to the local `.../Props/` directory, ready to be dragged onto the Scene Composition stage.

---

### Phase 5: STAGE (Scene Composition)
**The "Blocking Stage"**
Compose your shot by dragging your generated actors and props onto the canvas.

#### Token Properties vs. Actor Intelligence
When an actor or prop is on stage, you control them via two distinct panels:

*   **Token Properties (The Visuals):** Controls *where* the token sits on the canvas and *how they overlap* with other objects. Think of this as your layout engine.
    *   **Transform Tools:**
        *   **Position (X:Y) & Nudge:** Type exact pixel coordinates or use the Left/Right/Up/Down nudge tools for micro-adjustments.
        *   **Zoom/Scale (X:Y):** Controls the absolute scale of the token. Click the Chain Link icon to toggle aspect ratio locking (Uniform vs Non-Uniform scaling).
        *   **Anchor (X:Y):** Sets the physical pivot point of the token (0.5, 0.5 is dead center).
        *   **Rotate:** A slider for 360-degree rotation around the set Anchor point.
    *   **Z-Depth Layering:** The Back / Front buttons manually force the token behind or in front of other tokens and annotations on the 2D stage canvas.
    *   **Focus View:** Instantly centers and zooms your viewport on the currently selected character.
    *   **Duplicate / Copy:** Quickly clones a character and all their exact properties perfectly onto the stage.
    *   **Spatial & Occlusion:** Fine-tune how the character physically blends into the background environment's 3D space:
        *   **Occlusion Mode (Auto vs. Force Front):** "Auto (Depth)" computationally masks the actor based on their estimated 3D position in the scene compared to the background elements (e.g., placing them *behind* a desk). "Force Front" overrides this, ensuring the actor always renders entirely in front of the background.
        *   **Depth Bias (-1.0 to 1.0):** When in Auto mode, use this slider to aggressively shift the depth threshold. "Pull Closer" reveals more of the actor by treating them as closer to the camera lens, while "Push Back" increases the masking effect by pushing them deeper into the scene's geometry.
*   **Actor Intelligence (The Semantic DNA):** Controls *what* the actor is doing. This panel manages the textual "Prompt DNA" sent to the AI.
    *   **Auto Analyze:** Inspects the selected character and writes a highly specific prompt describing their pose, action, and lighting.
    *   **Semantic DNA (Text Box):** The text box ("Pose, Action, Lighting DNA...") is where you manually describe the character's actions to inject directly into the LLM prompt. Use this to override their default pose (e.g., *"Kneeling, holding a sword, angry expression"*).
    *   **Grounding (The Green Toggle):** When toggled ON (turns green), this forces the actor's Z-depth to bind to the physical "Ground Plane" detected in the background image. This ensures the actor is sorted correctly in 3D space exactly where their feet touch the ground, preventing them from floating or appearing in front of tables they should be behind.
    *   **Manual (Override Checkbox):** If the AI cannot detect a clear floor in the background image, it will block Grounding from turning on to prevent errors. Checking **MANUAL** overrides this safety block, forcing Grounding to remain ON even if the system warns about low-confidence floor detection.

#### Stage Controls & Tools
*   **Z-Depth Sorting:** Reorder layers in the sidebar to decide who is in front visually.
*   **Annotations (Note, Zone, Path):**
    *   **Drag and Drop:** You can drag these tools directly from the right toolbar onto the canvas to place them precisely where you need them.
    *   **Click to Spawn:** Alternatively, clicking the buttons will spawn them in a default position on the canvas.
    *   **Note Tool:** Add text guidance for the AI (e.g., "Looking at explosion", "Direct light source here").
    *   **Zone Tool:** Highlight specific areas on the stage to define boundaries or regions of interest.
    *   **Path Tool:** Draw sightlines, movement arrows, or character trajectories.
*   **Scene Generator (Anchor Ref):** Describe the setting (e.g., "Mars Base Interior") and generate a background plate to serve as the environment.

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

---

### Phase 6: ACTION (Production Rendering)
**The "Production Console"**
The final step where you compile the layout into a finished, lit, and shaded master frame.

1.  **Stage Input (The Layout):** The AI reads the *entire* spatial composition of Phase 5—calculating exactly where Actors and Props overlap, their scale, rotation, layer priority, and how the background scene is framed.
2.  **Prompt Collection:** The AI aggregates the Semantic DNA (Pose, Action) from your Actor Intelligence panel and all spatial Annotations (Notes, Zones) placed around the stage acting as context clues.
3.  **Anchor DNA (Lighting/Style Lock):** Upload or select a reference image specifically to dictate the final lighting, color grading, and atmospheric styling of the output render.
4.  **Final Render Compilation:** The engine processes these variables and executes a heavy generation (often using Gemini 3.1 Flash or Pro) to synthesize a flawless, cohesive final cinematic frame where lighting and shadows interact naturally across all composited elements.

---

## 4. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"Not Linked" Status** | Go to Settings and re-select your Save Folder. |
| **Green Artifacts** | In Wardrobe Studio, verify the "remove background" toggle is on. Manual brush can fix edges. |
| **Actor Name is "Actor-123"** | This is the file name. The App reads the valid name from the hidden `.json` file. |
| **Floating Heads in Suits** | In Try-On, ensure you aren't using a "Face Only" crop. The AI knows to put the body *inside* the suit. |
| **Library Not Updating** | Click the **Scan (↻)** button to force a folder re-read. |


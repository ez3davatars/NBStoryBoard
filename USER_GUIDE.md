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

**Core Workflow:**
1.  **Prompting:** Enter detailed descriptions (Age, Ethnicity, Style).
2.  **Visual Engine:** Select your **Studio Style** (e.g., Realism, Animation) to define the aesthetic.
3.  **Generate:** Click the Action button.

**Advanced Options:**
*   **Reference Sheets:** Generate full character sheets (Form, Face, Split) for consistency.
*   **Canvas Actions:** Manually crop/cut out sections directly on the canvas.
*   **Save to Library:**
    *   Click **"Add to Library"**.
    *   Select a **Category** (e.g., *Realism*).
    *   This saves the actor to `.../Actors/Realism/` with the sidecar JSON.
*   **Send to Director:** Locks the identity for Phase 2.

---

### Phase 1b: PORTRAIT (DNA Engine)
**The "Portrait Studio"**
Use the Portrait Studio to establish a baseline character using precise biometric and morphological traits before full casting. The studio operates in two distinct modes: **Synthetic** (building a face from scratch) and **Reference** (using an existing photo).

**Mode 1: SYNTHETIC (Create from Scratch)**
*   **Identity Matrix:** Use the dropdowns to construct the fundamental demographics (e.g., Male, Hispanic/Latino, Type III Tone).
*   **Life Stage & Age:** Select a broad life stage (e.g., Adult) and fine-tune with the Chronological Age slider.
*   **Morphology:** Adjust the height and weight sliders to calculate the character's Metabolic Index (BMI) and physical build (e.g., Athletic, Average, Heavy).

**Mode 2: REFERENCE (Upload a Photo)**
*   **Identity Reference Photo:** Drag & drop or upload a source photograph. The system will lock on to this facial identity as the absolute truth.
*   **Likeness Fidelity Lock (0-100%):** Controls how strictly the AI adheres to the uploaded photo. 100% enforces an exact, unyielding clone (preserving eyewear, facial hair, and styling). Lowering the percentage allows the AI more creative liberty to alter the face.
*   **Age Transform:** While the core identity is locked to the photo, you can use the Life Stage and Chronological Age controls to apply a seamless age progression or regression to the uploaded face.
*   *(Note: In Reference Mode, basic morphology like height/weight is locked to prioritize the source image).*

**DNA Output Stream (Both Modes)**
*   **Generate DNA Portrait:** Compiles your chosen settings (or Reference photo) into a highly detailed "Studio Protocol" prompt to generate a perfect, consistent headshot. *Requires an uploaded image if Reference mode is active.*
*   **Send to Casting:** Transfers the generated portrait to the Casting Forge (Phase 1) to act as a permanent locked actor.
*   **Send to Ref Sheet:** Sets up the newly created face for multi-angle character design sheets.

---

### Phase 2: NANO CAST (Biometric & Style Engine)
**The "Director's Monitor"**
Refine a generated character or inject your own biometric identity.

**A. Biometric Acquisition (Human-to-Digital)**
Turn yourself into the character.

**Step-by-Step:**
1.  **Toggle Camera:** Click the **Camera Icon** (Top Right) to enable the webcam.
2.  **Sidebar Mode:** Switch Sidebar to **biometric acquisition**.
3.  **Capture Angles:**
    *   **Center:** Look straight ahead. Click **Manual Capture** or use **Auto-Scan**.
    *   **Left/Right:** Turn your head 90 degrees.
    *   **Upload Option:** Use the **Upload** toggle to pick high-res photos instead of webcam frames for higher quality.
4.  **Process:** Once `Center`, `Left`, and `Right` are acquired, proceed to **Phase 02 (Matrix)**.

**B. Director's Console (Refinement)**
Found in the **Director** sidebar tab.

*   **Identity Lock (0-100%):** How strictly the AI adheres to the source face. 100% = Exact Clone.
*   **Stylization:** Intensity of the chosen art style.
*   **Approx. Age:** Adjusts the perceived age of the character.
*   **Branding & Identity:**
    *   **Logo Upload:** Upload a transparent PNG (e.g., a faction symbol).
    *   **Placement:** Type where it goes (e.g., "Left Chest", "Hat Brim").
*   **Save Character:** Finalizes the blended avatar and saves it to the library.

---

### Phase 3: WARDROBE STUDIO (Designer & Virtual Try-On)
**The "Costume Department"**

#### Part A: Costume Designer (Tab 1)
Create unique clothing assets from scratch or using references.

**Design Reference (Optional):**
You can upload an image to guide the AI's generation. This is a temporary "session only" reference.
*   **SKETCH:** Select this if you are uploading a fashion sketch, drawing, or sewing pattern. The AI will interpret the drawing and construct a photorealistic, finished wearable garment based on those lines.
*   **COSTUME:** Select this if you are uploading a photo of an existing garment. The AI will use it to match the silhouette, materials, and overall look, creating a clean studio product shot of it.

**Step-by-Step:**
1.  **Reference (Optional):** Upload a Sketch or Costume photo.
2.  **Prompt:** Describe the outfit (e.g., "Cyberpunk neon trench coat") to guide the AI further.
3.  **Generate:** Creates the standalone clothing item on a black studio background.
3.  **Verify & Save:**
    *   **Save to Wardrobe:** Adds it to the local `wardrobe` folder for Try-On.
    *   **Download:** Exports the image file.

#### Part B: Virtual Try-On Room (Tab 2)
Fit costumes onto actors.

**Try-On Setup & Controls (Right Panel):**
*   **Remove BG:** Toggle this on to automatically remove the background from the generated try-on image once it completes.
*   **Character Sheet (Identity Anchor):** Upload a previously generated character sheet (from the Casting Forge). This acts as a strict identity anchor, which is highly recommended when generating turnaround sheets to ensure the character's face and body remain consistent across all angles.
*   **Output Views:** 
    *   **FRONT:** Generates a standard, single-image front view of the character wearing the outfit.
    *   **TURNAROUND:** Generates a comprehensive two-sheet turnaround containing Front, Back, Left, and Right views of the character in the outfit.
*   **Upload Sketch/Costume:** A quick shortcut to open the Costume Designer tab to generate or upload new reference materials.

**Step-by-Step Workflow:**
1.  **Select Subject:** Click an actor from the "Selected Subject" row.
2.  **Select Wardrobe:** Click a costume from the "Active Wardrobe" list.
3.  **Configure Setup:** Set your desired **Output View** (Front or Turnaround) and upload a **Character Sheet** if you want to lock their identity for multi-angle generation.
4.  **Fitting Notes:** Add specific instructions (e.g., "Battle damaged", "Tucked in").
5.  **Execute Virtual Try-On:**
    *   The system merges the costume onto the actor.
    *   **Logic:** It enforces strict **Single Subject** rules (No mannequins, no floating heads).
    *   **Mascot Suits:** It understands the actor is *inside* the suit.

#### Part C: Background Removal & Restoration
Once a character is fitted:
1.  **Remove Background:** Click the toggle in the top right.
    *   *System:* Uses AI to remove the green screen.
2.  **Edge Refinement:** Uses "Green Suppression" to clean neon spill.
3.  **Manual Restoration (Brush):**
    *   Click the **Restore Brush** (Eraser Icon).
    *   **Paint** over areas that were accidentally removed (e.g., a translucent helmet or thin strap).
    *   This "un-erases" the original image logic.
4.  **Save to Library:**
    *   Saves the **Processed Image** (Transparent BG) to the library.
    *   *Note:* Prioritizes the edited version over the original raw render.

---

### Phase 4: PROPS (Asset Management)
**The "Prop House"**

1.  **Generate:** Create handheld items or set dressing (e.g., "Rusty sci-fi crate").
2.  **Isolate:** Remove background same as Wardrobe Studio.
3.  **Save:** Adds to `.../Props/` for Scene Composition.

---

### Phase 5: STAGE (Scene Composition)
**The "Blocking Stage"**
Compose your shot by dragging your generated actors and props onto the canvas.

#### Token Properties vs. Actor Intelligence
When an actor is on stage, you control them via two distinct panels:
*   **Token Properties (The Visuals):** Controls *where* the actor sits on the canvas (X/Y position, Scale/Zoom, Rotation) and *how they overlap* with other objects (Z-index layering and depth-based occlusion masking). Think of this as your layout engine.
    *   **Focus View:** Instantly centers your view on the selected character.
    *   **Duplicate / Copy:** Quickly clone a character on the stage.
    *   **Spatial & Occlusion:** Fine-tune how the character physically blends into the environment's 3D space:
        *   **Occlusion Mode (Auto vs. Force Front):** "Auto (Depth)" computationally masks the actor based on their estimated 3D position in the scene compared to the background elements (e.g., placing them *behind* a desk). "Force Front" overrides this, ensuring the actor always renders entirely in front of the background.
        *   **Depth Bias (-1.0 to 1.0):** When in Auto mode, use this slider to aggressively shift the depth threshold. "Pull Closer" reveals more of the actor by treating them as closer to the camera lens, while "Push Back" increases the masking effect by pushing them deeper into the scene's geometry.
*   **Actor Intelligence (The Semantic DNA):** Controls *what* the actor is doing. This panel manages the textual "Prompt DNA" sent to the AI.
    *   **Auto Analyze:** Inspects the selected character and writes a highly specific prompt describing their pose, action, and lighting.
    *   **Grounding:** Anchors the actor vertically to the detected 3D floor plane so they don't look like they are floating. (Automatically enabled when dragging sliced actors onto the canvas).
    *   **Anchor Depth:** Sets the textual category (Fore/Mid/Back) injected into the prompt, ensuring the AI understands the scale of the scene.

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

1.  **Input:** Reads the entire Stage Layout (Actors, Props, Background, Notes).
2.  **Anchor DNA:** Locks the lighting style from your reference.
3.  **Render:** Generates the final cinematic frame, blending all elements into a cohesive image.

---

## 4. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"Not Linked" Status** | Go to Settings and re-select your Save Folder. |
| **Green Artifacts** | In Wardrobe Studio, verify the "remove background" toggle is on. Manual brush can fix edges. |
| **Actor Name is "Actor-123"** | This is the file name. The App reads the valid name from the hidden `.json` file. |
| **Floating Heads in Suits** | In Try-On, ensure you aren't using a "Face Only" crop. The AI knows to put the body *inside* the suit. |
| **Library Not Updating** | Click the **Scan (↻)** button to force a folder re-read. |


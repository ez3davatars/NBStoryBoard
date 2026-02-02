# Cast Director Studio User Guide
**Version 1.0** | **Date:** 2026-02-01

---

## 📖 Table of Contents
1.  **Introduction**
2.  **Getting Started**
    *   System Requirements
    *   Storage & Synchronization
3.  **The Studio Workflow**
    *   **Phase 1: CAST** (Character Generation)
    *   **Phase 2: NANO CAST** (Refinement & Wardrobe)
    *   **Phase 3: WARDROBE STUDIO** (Manual Tools)
    *   **Phase 4: PROPS** (Asset Management)
    *   **Phase 5: STAGE** (Scene Composition)
    *   **Phase 6: ACTION** (Production Rendering)
4.  **Troubleshooting**

---

## 1. Introduction
Welcome to **Cast Director Studio**, powered by Nanobanana Pro. This comprehensive suite provides precision tools for character casting, costume management, and cinematic staging. The platform is designed around a logical studio pipeline, moving from individual asset creation to final scene production.

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
    *   Check the status indicator at the top of the library. It should read <span style="color:#22c55e; font-weight:bold;">CONNECTED</span> in green.
    *   *Note: If it reads <span style="color:#ef4444; font-weight:bold;">NOT LINKED</span>, assets will only be stored in temporary memory.*

---

## 3. The Studio Workflow

### Phase 1: CAST (Character Generation)
**The "Casting Forge"**
Your journey begins here. Use the Casting Forge to generate new high-fidelity actors from scratch or import existing references.

**Core Workflow:**
*   **Prompting:** Enter detailed descriptions of your character (Age, Ethnicity, Style).
*   **Generative Engine:** Select your AI Model and Studio Style (e.g., Realism, Animation) to create a base portrait.

**Advanced Options:**
*   **Reference Sheets:** Instead of a single portrait, you can generate a full character sheet with multiple angles/poses for technical consistency. Select from **Form** (total turnaround), **Face** (expressions), or **Split** (hybrid hero) layouts.
*   **Canvas Actions:**
    *   **Cutout & Save:** You can manually crop/cut out specific sections of a generated character directly on the canvas.
*   **Saving to Library (Disk & Memory):**
    1.  When you are happy with a character (or a specific cutout), click the **"Add to Library"** button.
    2.  A **Category Modal** will appear, asking you to classify the actor (e.g., *Realism Studio, Animation Studio, Sci-Fi Studio*).
    3.  Select the appropriate folder. The system will automatically save the high-resolution asset to your project's rigid folder structure (e.g., `.../MyProject/Actors/Realism/`) and register it in the global library.
*   **Action:** Click **"Send to Director"** to lock this actor's identity.
    *   *Technical Note:* This action injects the character's biometric data into the Nano Cast engine, ensuring that all future costume changes and scene placements perfectly retain this specific facial identity.

### Phase 2: NANO CAST (Refinement & Wardrobe)
**The "Director's Monitor"**
This engine allows you to finalize your character's identity. There are two ways to enter this phase:

**A. Computed Identity (AI Character):**
*   **Source:** Imported directly from the *Casting Forge* (Phase 1).
*   **Goal:** Refine the features and wardrobe of a purely digital actor.

**B. Biometric Identity (Human-to-Digital):**
*   **Source:** Your Webcam.
*   **Goal:** Scan your own face to **turn yourself into the character**.
*   **Workflow:** The interface guides you through a 5-phase acquisition process to map your facial structure onto a digital body.

**Phase Breakdown (Biometric Scan):**
*   **Phase 01:** **Biometric Acquisition.** The system scans your "Anchor Face" to establish the biometric baseline.
    *   *Scan Sequence:* Face Center -> Anchored.
    *   **Upload Capability**: You can upload pre-taken photos for each head position instead of scanning.
    *   **Quality Note**: **Higher resolution = Better Avatar.** Uploading photos from a high-quality camera will produce significantly more detailed results than a standard webcam scan.
*   **Phase 02:** **Morphological Matrix.** Select your physical archetype (Titan, Scout, Guardian, Sprite).
*   **Phase 03:** **Art Style.** Choose your visual aesthetic (e.g., Pixar, Cyberpunk, Realism).
*   **Phase 04:** **Director's Console (Right Panel)**
    *   **Branding & Identity**:
        *   **Usage**: Upload a PNG logo (transparent background recommended) and specify the precise placement (e.g., "Center Chest", "Hat Brim").
        *   **Best For**: Adding branded logos or graphics to **T-shirts**, **Clothing**, or **Hats**.
    *   **Configuration Controls**: 
        *   **Identity Lock**: Set to **100%** for an exact facial replica.
        *   **Stylization**: Balances intensity of style vs. raw likeness.
        *   **Approximate Age**: Adjust the slider to match your target character's age.
*   **Body Scope:** Below the style cards, select your render framing: **Head**, **Torso**, or **Full Body**.

*   **Phase 05:** **Digital Reconstruction**
    *   Review the generated "Gold Standard" actor.
    *   **Action:** Click **"Initialize Neural Link"** to generate your biometric avatar.
    *   **Reconstruction Complete (Save & Sync):**
        *   **Add Actor** (`UserPlus`): Use this for temporary session-only tokens.
        *   **Save to Actor Library** (Purple Folder icon): Permanently save your biometric double to your project's `Actors` library for use in any future production.
        *   **Regenerate:** Quickly try a different seed if the reconstruction isn't perfect.

**Sidebar Controls:**
*   **Toggle Tabs:**
    *   `DIRECTOR`: Access physical parameters (Height, Weight) and Basic Outfit Prompt.
        *   *Tip:* Use the **CLEAR** button next to the prompt label to reset.
    *   `BIOMETRIC ACQUISITION`: Capture or upload **Center**, **Left**, and **Right** angles of the face.
        *   **Upload Option**: You can upload existing high-resolution photos for each angle instead of scanning live. 
        *   **Pro Tip**: While the webcam feature produces great results, the higher the resolution of your source images, the higher the quality of the final avatar details. Using a high-end camera is often superior to a standard webcam.
        *   **Camera Control**: Use the **Eye/EyeOff** icon toggle to enable or disable the live webcam feed.
    *   `WARDROBE`: Access your visual Costume Library.
*   **Wardrobe Library:**
    *   **Upload (↑):** Import costume images.
    *   **Scan (↻):** Refresh the library view.
    *   **Active Selection:** Click a card to apply it. The active item glows with a **Neon Green** border.
    *   **Shared Assets:** Any costume visible here is available for the "Fit & Try-On" process.

### Phase 3: WARDROBE STUDIO (Manual Tools)
**The "Costume Department"**
For precise control over costume assets, enter the Wardrobe Studio.

**The Costume Designer:**
*   **Generative Text Box**: Type any costume description into the text box (e.g., "Cyberpunk neon trench coat with glowing red accents").
*   **Specific Features**: You can specify style, color, material, and intricate details.
*   **Action**: Click **Generate** to create unique, AI-synthesized clothing assets from scratch.
*   **Save to Library**: Verify the result and save it to your **Wardrobe Library** to make it available for any actor in your cast.

**Workflow:**
1.  **Generate/Upload:** Load a clothing reference image.
2.  **Verify:** The system places it on a Neon Green calibration background.
3.  **Execute Isolation:** Click **Isolate Subject** to remove the background.
    *   *Auto-Cleanup:* The system automatically suppresses green spill to ensure clean borders.
4.  **Manual Restoration:**
    *   Select the **Restore Brush** tool.
    *   Paint over missing details (straps, accessories) to bring them back.
    *   Use **Undo/Redo** to perfect the mask.
5.  **Save Options**:
    *   **Wardrobe Library** ("Save to Wardrobe"): Saves the standalone clothing asset to the costume library for use in Nano Cast.
    *   **Actor Library** (Purple Folder icon): After fitting a costume to an actor, use this to save the combined result as a new permanent actor profile (`portrait.png` + `actor.json`) in your preferred library category.
    *   **Add to Cast** (`UserPlus`): Injects the result directly into your current session's cast assets.

### Phase 4: PROPS (Asset Management)
**The "Prop House"**
This dedicated workspace manages non-costume assets.

**The Props Designer:**
*   **Generative Text Box**: Input a description of any object you need (e.g., "Rusty steam-powered gauntlet with pressure gauges").
*   **Customization**: Define the object's era, condition, and visual style.
*   **Action**: Click **Generate** to produce high-fidelity prop assets ready for isolation and staging.
*   **Save to Library**: Add the unique item to your persistent **Prop Library** to build a reusable arsenal of assets.

*   **Item Types:** Handheld items, weapons, furniture, and set dressing.
*   **Organization:** Props are stored in the `.../MyProject/Props/` directory.
*   **Function:** Like costumes, props can be isolated and prepped for stage insertion.

### Phase 5: STAGE (Scene Composition)
**The "Blocking Stage"**
Compose your final shot by placing your actors and assets.
*   **Tokens:** Drag and drop "Stage Tokens" (Actors/Props) onto the canvas.
*   **Layout:**
    *   **Position (X/Y):** Move tokens to frame the shot.
    *   **Scale/Rotate:** Adjust size and angle for perspective.
    *   **Depth (Z-Index):** Layer items in front or behind each other.
*   **Director's View:** The canvas represents the camera frame (16:9). What you see here dictates the composition of the final render.
    *   **Scene Generator**: Used to create a full background scene from scratch. Describe your setting and generate it instantly.
    *   **Annotations**: Use the **Note Tool** to type instructions (e.g., "Actor looks here") and the **Arrow Tool** to draw directional cues on the canvas. These guide the AI on actor placement and focus.

**Staging Sidebar Tools:**
*   **Context Specs:** Define the global setting description (e.g., "A high-tech control room with blue neon lighting"). This sets the overall mood and environment.
*   **Anchor Ref:** Upload a specific image to serve as the structural or lighting reference.
    *   **Lock Scene**: This "locks" the scene composition in place.
    *   **Style Transfer**: You can perform a style transfer on the anchor and type a specific style note to override the aesthetic while keeping the structure.
*   **Stage Layers:** Manage your tokens (Actors, Props) in a list view. Reorder them to change Z-Depth (who is in front) or lock them to prevent accidental movement.
*   **Reference Stacks:** Upload stylistic references (e.g., film grain, color grading examples) to influence the final "look and feel" without changing the geometry.
*   **Region Edit:** (Advanced) Draw specific zones on the canvas to isolate where certain prompts apply. Use this to change *just* the background wall or *just* the floor texture.
*   **Scene Director:** The master control for the scene's logic. It compiles all your layers, prompts, and references into the final instruction set for the render engine.

### Phase 6: ACTION (Production Rendering)
**The "Production Console"**
Render the final high-fidelity scene.
*   **Input:** The system reads your Stage Layout (Phase 5).
*   **Parameters:**
    *   **Anchor DNA:** Analyze and lock the lighting/environment style.
    *   **Continuity:** Ensure actor faces match their reference files.
*   **Render:** Click **"Action!"** to generate the final cinematic image.
*   **Output:** High-resolution images are saved to your project folder.

---

## 4. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"Not Linked" Status** | Go to Settings and re-select your Save Folder. Ensure you have Write Permissions for that directory. |
| **Green Artifacts** | If green pixels remain after isolation (Wardrobe Studio), try increasing the "Edge Refinement" slider. |
| **Library Not Updating** | Click the **Scan (↻)** button in the Nano Cast sidebar to force a refresh. |
| **Missing Actors** | Ensure you clicked "Save to Library" in the Casting Forge or Nano Cast view. |

---
*For further assistance, please contact the Nanobanana Pro support team.*

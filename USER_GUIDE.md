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
Create unique clothing assets.

1.  **Prompt:** Describe the outfit (e.g., "Cyberpunk neon trench coat").
2.  **Generate:** Creates the item on a white studio background.
3.  **Verify & Save:**
    *   **Save to Wardrobe:** Adds it to the local `wardrobe` folder for Try-On.
    *   **Download:** Exports the image file.

#### Part B: Virtual Try-On Room (Tab 2)
Fit costumes onto actors.

**Step-by-Step:**
1.  **Select Subject:** Click an actor from the "Selected Subject" row.
2.  **Select Wardrobe:** Click a costume from the "Active Wardrobe" list.
3.  **Fitting Notes:** Add specific instructions (e.g., "Battle damaged", "Tucked in").
4.  **Execute Virtual Try-On:**
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
Compose your shot.

*   **Tokens:** Drag Actors and Props onto the 16:9 Canvas.
*   **Controls:**
    *   **Position/Scale:** Arrange elements to frame the narrative.
    *   **Z-Depth:** Reorder layers in the sidebar to decide who is in front.
*   **Annotations:**
    *   **Note Tool:** Add text guidance for the AI (e.g., "Looking at explosion").
    *   **Arrow Tool:** Draw sightlines or movement paths.
*   **Scene Generator:** Describe the setting (e.g., "Mars Base Interior") and generate a background plate.

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


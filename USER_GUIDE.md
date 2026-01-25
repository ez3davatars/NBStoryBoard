# Cast Director Studio: User Guide

Welcome, Director. This guide will take you from your first casting call to your final render.

## 🏁 Getting Started

Before you can yell "Action!", you need to power up the studio.

1.  **Launch the App**.
2.  **Configure API**:
    *   Click the **Gear Icon** (⚙️) in the top-right corner.
    *   Enter your **Gemini API Key** (or standard Google Cloud equivalent).
    *   **Choose a Save Folder**: This is crucial. Click "Choose Save Folder" and pick a location on your drive where all your actors, costumes, and rendered shots will live.
    *   **Select Engine**: "Gemini 3 Pro (Vision Ultra)" is recommended for best results.
    *   Click **Save Config**.

---

## 🎭 Act I: The Casting Call
*Create persistent, biometric digital actors.*

1.  Navigate to the **NANO CAST** tab.
2.  **Phase 1: Biometric Acquisition**
    *   **Biometric Acquisition**: Capture or upload **Center**, **Left**, and **Right** angles of the face.
    *   **Camera Control**: Use the **Eye/EyeOff** icon toggle to enable or disable the live webcam feed.
    *   **Precision Controls**: Click **CONTROLS** in the header to fine-tune the synthesis:
        *   **Identity Lock**: Controls how strictly the AI matches the reference face (higher = more literal).
        *   **Stylization**: Balances the intensity of the art style vs. raw likeness.
        *   **Approx. Age**: Adjusts the perceived age of the digital reconstruction.
    *   **Crucial Tip**: High-quality lighting and high-fidelity reference images are essential for cinema-grade results.
3.  **Phase 2: Body Archetype**
    *   Choose a body type (e.g., *The Titan*, *The Scout*, *The Guardian*).
    *   This determines the physical build of your digital actor.
4.  **Phase 3: Style Synthesis**
    *   Select the art style for this actor (e.g., *Exact Likeness Studio*, *Retro Cel Anime*, *Graphic Noir*, *Cyberpunk Neon*).
6.  **Phase 5: Digital Reconstruction**
    *   Review the generated "Gold Standard" actor.
    *   **Save to Cast**: Adds them to your local library for use in scenes.
## 📋 Character Reference Sheets
*Generate technical turnarounds for 3D modeling and production.*

The Reference Sheet Generator produces professional, technical turnarounds of your characters. It is available in both the **Casting Forge** and the **Nano Casting Director**.

### 📐 Three Layout Modes
1.  **Form Focus (Layout A)**:
    *   **Best For**: General 3D modeling and costume design.
    *   **Structure**: Top 65% height: Row of 3 Full Body views (Front, Side, Back). Bottom 35% height: Grid of 4 Headshots.
2.  **Face Focus (Layout B)**:
    *   **Best For**: Facial rigging, identity precision, and skin texture.
    *   **Structure**: Top 55% height: Row of 4 Large Headshots. Bottom 45% height: Row of 3 Full Body views.
3.  **Split Focus (Layout C)**:
    *   **Best For**: Marketing assets and compact studio overviews.
    *   **Structure**: Vertical split. Left 45% width: Stack of 3 Full Body views. Right 55% width: 2x2 Grid of Large Headshots.

### 🚀 How to Generate
*   **In Casting Forge**: Navigate to the **Source Material** section, scroll to **3. Reference Sheet**, select your layout, and click **Generate Reference Sheet**.
*   **In Nano Casting Director**: Complete the biometric capture up to **Phase 5**, then use the layout selector in the **Results/Actions** panel.

### ✨ Quality & Anti-Duplication
All sheets are generated with strict **High-Fidelity Engine** guards:
*   **Zero Distortion**: Facial symmetry and identity are enforced.
*   **Exact Counts**: Strict "Anti-Duplication" constraints prevent hallucinated figures in empty zones.
*   **Sheet Management**: Use **Download** for PNG export, **Save to Disk** to store in `/ReferenceSheets`, or **Cast** to save as a production asset.

> [!NOTE]
> **Production Note:**
> Reference sheets are generated using high-fidelity AI synthesis. While identity, structure, and layout are strictly enforced, minor variations or inaccuracies may occur due to model behavior. For production-critical use, review all outputs before downstream deployment.

---

## 👗 Act II: The Wardrobe
*Manage synthesized clothing and props.*

1.  Navigate to **WARDROBE**.
2.  You can view assets saved during previous sessions.
3.  Use the **Generator** (if available) to describe new items (e.g., "Neon flight jacket"). Click **'Generate & Fit'** to create and preview.
4.  **Virtual Try-On**: Select any actor from your cast library and any item from your wardrobe to see them wear it. *Note: Once a costume is generated, it is a persistent asset that can be worn by ANY actor in your cast.*

---

## 📦 Act III: The Prop Shop
*Design and integrated narrative objects.*

1.  Navigate to **PROPS**.
2.  **Prop Library**: View your saved arsenal of gadgets, artifacts, and tools.
3.  **Designer Workshop**:
    *   Describe the object you need (e.g., "Vintage rangefinder camera", "Ancient leather grimoire").
    *   Click **Generate Prop** to create it on a clean studio background.
    *   **Save to Library** to keep it for future scenes.
4.  **Application Room**:
    *   Select a **Subject** (Actor) and a **Prop** (Item).
    *   Add a placement note (e.g., "Holding the camera up to take a photo").
    *   **Execute Integration**: The AI will naturally blend the object into the actor's hand or environment.
5.  **Save Result**: You can save this new "equipped" actor back to your Cast Library as a new variant.

---

## 🎬 Act IV: Setting the Stage
*Compose your scene with precision.*

1.  Navigate to **STAGING**.
2.  **The Anchor (Background)**:
    *   **Drag & Drop** a background image onto the canvas OR use the "Generate Background" prompt at the bottom to create one.
    *   **Analyze DNA**: Click "Analyze Anchor DNA" to extract lighting and camera data from your background automatically.
3.  **Casting**:
    *   Open the **Library Sidebar**.
    *   **Drag your Actor** onto the stage.
4.  **Direction**:
    *   **Position**: Drag the actor to where they should stand.
    *   **Scale/Rotate**: Use the corner handles to resize or the top handle to tilt.
    *   **Z-Index**: Use "Send Backward" / "Bring Forward" to arrange who is in front of whom.
5.  **Annotations**:
    *   Use the **Sticky Note** tool to add specific instructions for the AI (e.g., "Holding a red apple", "Looking surprised"). Place the note near the relevant subject.
6.  **Ref References (Advanced)**:
    *   **Use the slots on the right to upload specific pose or style references if you need exact matching.

---

## 🎥 Act V: Production
*Render the final shot.*

1.  Navigate to **PRODUCTION**.
2.  **Review the Plan**: You'll see a breakdown of your scene (Regions, DNA, etc.).
3.  **Director Settings**:
    *   Can tweak "Film Stock", "Safety Mode", or "Aspect Ratio" here.
4.  **Action!**:
    *   Click **RENDER SCENE**.
    *   The system will compile your stage layout, actor biometrics, and background DNA into a master prompt.
5.  **The Dailies**: The result will appear in the viewport. Review the composition and lighting to ensure it meets your vision.
6.  **Export Options**: Click the **Download Icon** (📥) to save the high-fidelity render directly to your save folder.

---

## 🎞️ Encore: Export & High-Fidelity Output
*Your pipeline to the professional world.*

1.  **High-Fidelity Renders**: The "Production" tab delivers cinema-grade quality by default. These frames are designed for professional color grading and further synthesis.
2.  **Export Tools**:
    *   **Click "Save Image"** to download the standalone high-fidelity render directly.
    *   *Note: These outputs are production-ready for use in Veo and any other AI video generation tool.*

---

**Pro Tip**: Use the **Settings** menu to toggle "Strict Mode" if you want the AI to adhere 100% to your stage layout, or disable it to let the AI hallucinate more creative compositions.

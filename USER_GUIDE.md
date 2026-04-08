# Cast Director Studio User Guide
**Version 1.0.1**

---

## Table of Contents
1. Introduction
2. Quick Start
3. Work by Goal
4. Feature Guide by Tab
5. Recommended Studio Pipeline
6. Troubleshooting

---

## 1. Introduction
Welcome to **Cast Director Studio**, powered by **Nanobanana 2**. Cast Director Studio helps you create, refine, style, and stage characters for polished visual output.

You can use the app in a flexible way. Some users move step-by-step from character creation to scene staging. Others jump directly into a specific tab depending on what they need.

> **Note on Preview Features:** Core creation tools like character generation, portrait refinement, wardrobe, props, and targeted post-production are fully ready. Some advanced scene systems (like Stage preview) are still evolving.

### Core Tabs at a Glance
- **CAST** — Generate new characters from scratch.
- **NANO CAST** — Build from biometric capture, photos, or identity references.
- **PORTRAIT** — Refine facial identity, age, morphology, and likeness.
- **WARDROBE** — Design outfits and run virtual try-on.
- **PROPS** — Create and isolate reusable objects.
- **STAGE [PREVIEW]** — Arrange actors, props, and scene direction. Includes SHOTS for cinematic sequences.
- **REGION EDIT / POST-PRODUCTION** — Fix or replace specific parts of a generated image.

### Where Should I Start?
- **I want to create a new character** → Start in **CAST**.
- **I want to build from a real face or photo** → Start in **NANO CAST** or **PORTRAIT** Reference Mode.
- **I want to style a character with clothing or branding** → Start in **WARDROBE**.
- **I want to create props or handheld objects** → Start in **PROPS**.
- **I want to build a scene** → Start in **STAGE [PREVIEW]**.
- **I want to fix only part of an image** → Start in **REGION EDIT / POST-PRODUCTION**.

---

## 2. Quick Start

### Step 1: Connect Your Save Folder
The system includes a shared save-folder link so your work can move across tabs.

1. Open **Settings** (gear icon in the top right).
2. Find **Render Save Folder**.
3. Click **Choose Save Folder**.
4. Select your main project directory.

### Verification
- Go to **Nano Cast**.
- Open the sidebar controls.
- Confirm the status reads **CONNECTED** in green.
- If it reads **NOT LINKED**, assets may only exist in temporary memory.

### File Structure Note
When you save an actor, the system uses a native file structure:
- **Image file:** `Actor-{Timestamp}.png`
- **Metadata sidecar:** `Actor-{Timestamp}.json`

The PNG stays generic for safe file handling, while the JSON stores the real actor name, tags, and style data.

### Step 2A: Set Your AI Generation Preferences
In **Settings**, configure:
- **Active Engine** — Recommended: **Gemini 3.1 Flash (Image)**
- **Image Resolution** — 1K, 2K, or 4K
- **Thinking Mode** — Better prompt adherence, slower generation
- **Google Image Search Grounding** — Useful for real-world accuracy
- **Enable Storyboard (Veo 3.1)** — Experimental early-access feature

### Step 2B: Billing Mode and Credits
The app may support different generation modes depending on your account setup. Always confirm which mode is active in your Settings before generating.
- **Hosted Mode:** Uses your account entitlements and generation credits. Hosted users should monitor their available credits in the account area or wherever credit visibility exists in the current build.
- **BYOK Mode:** Bring Your Own Key. Uses your own connected AI provider API workflow to process images.

### Step 2C: Saved Assets vs Temporary Results
As you generate images across the studio, many results remain temporary until you actively save them.
- A generated result is often just a temporary preview; it may not persist across clears, screen refreshes, or session changes.
- If you want to reuse an actor, prop, or outfit result later, **you must explicitly save it** to the proper library using the available save actions.
- Refreshing or rescanning your library view may be needed after save or delete actions to securely confirm long-term storage updates.

### Step 3: Complete a First 5-Minute Workflow
A simple first pass:
1. Go to **CAST** and generate a character.
2. Save the character to your library.
3. Open **WARDROBE** and apply a costume.
4. Open **STAGE [PREVIEW]** and place the character on a background.
5. Click **Generate Composite**.

That gives you a fast end-to-end understanding of the studio.

---

## 3. Work by Goal

### Create a Character from Scratch
Use this path if you do not already have a face or identity reference.

**Best starting point:** **CAST**

1. Write a prompt describing the character.
2. Choose a visual style.
3. Generate the actor.
4. Save them to the library.
5. Optionally send them to **Portrait** or **Nano Cast** for refinement.

### Build a Character from a Photo or Real Person
Use this when you want strong identity preservation.

**Best starting point:** **NANO CAST** or **PORTRAIT Reference Mode**

1. Upload a reference photo or capture biometric angles.
2. Build the biometric/identity profile.
3. Adjust likeness fidelity.
4. Refine age, hair, or surface details if needed.
5. Save the result to the library.

### Style a Character with Clothing, Branding, or Visual Identity
Use this when the face already exists and the next step is styling.

**Best starting point:** **WARDROBE**

1. Select a saved character.
2. Design or import a costume.
3. Apply branding/logo placement if needed.
4. Run virtual try-on.
5. Save the clean result for staging.

### Create Props and Reusable Assets
Use this for objects, handheld items, set dressing, or visual accessories.

**Best starting point:** **PROPS**

1. Generate the object.
2. Remove the background.
3. Refine edges if needed.
4. Save the isolated prop to the library.
5. Bring it into **STAGE [PREVIEW]** later.

### Build a Staged Scene
Use this when you already have actors, wardrobe, and optionally props.

**Best starting point:** **STAGE [PREVIEW]**

1. Add a background image.
2. Drag actors and props onto the stage.
3. Adjust token position, scale, depth, and notes.
4. Use Scene Director and Actor Intelligence as needed.
5. Generate a composite.

### Fix or Replace Part of a Generated Image
Use this when the full scene is mostly good but a localized area needs correction.

**Best starting point:** **REGION EDIT / POST-PRODUCTION**

1. Paint the area you want to change.
2. Write a precise instruction.
3. Use Protect Face/Hair if needed.
4. Apply the enabled mask layer.

---

## 4. Feature Guide by Tab

## CAST
**Purpose:** Generate new characters from scratch.

### Core Controls
- **Prompt box** — Describe the character’s age, look, ethnicity, style, or role.
- **Studio Style dropdown** — Realism, Animation, Anime, Concept Art, and other visual directions.
- **Generate** — Starts the image generation.

### Advanced Options
- **Reference Sheets** — Generate multi-angle sheets for consistency.
- **Canvas Actions / Crop** — Slice or isolate useful parts of the generated image.
- **Save to Library** — Permanently store the actor for later use.
- **Send to Director** — Move the result into Nano Cast for biometric/style refinement.
- **Cast Assets List** — See current generated tokens and clear temporary ones if needed.

### When to Use CAST
Use CAST when you want a fresh synthetic character and do not need a real-world identity lock yet.

---

## PORTRAIT
**Purpose:** Build or refine a face with precision.

Portrait supports two modes:
- **Synthetic** — Build from scratch
- **Reference** — Build from an uploaded photo

### Synthetic Mode
Use this to define:
- sex
- ethnicity
- skin tone
- age
- body measurements
- facial architecture
- hair and surface details

### Reference Mode
Use this when you already have a face to preserve.

Key controls:
- **Identity Reference Photo**
- **Likeness Fidelity Lock**
- **Age Transform**
- **Selective Unlocks** for hair, skin, morphology, and architecture

### Output Actions
- **Generate DNA Portrait**
- **Clear Portrait Options** — Clearing a portrait or reference is now intended to fully clear the active portrait state. Once cleared, the workspace should comfortably remain clean instead of repopulating unexpectedly.
- **Send to Casting**
- **Send to Ref Sheet**

### When to Use PORTRAIT
Use PORTRAIT when facial fidelity and structural control matter more than broad character ideation.

---

## NANO CAST
**Purpose:** Build a character from biometric or photo identity and refine their look. 

Reference-based builds are best when facial identity needs to stay more consistent. Better source photos generally produce better identity preservation—front-facing, clear, and well-lit inputs are highly recommended.

### Biometric Acquisition
1. Enable the webcam or upload local images.
2. Capture or import:
   - Center
   - Left
   - Right
3. Build the biometric matrix.

### Director Console
Use these controls to refine the output:
- **Identity Lock Slider**
- **Stylization Intensity**
- **Approximate Age**
- **Branding & Logo Placement**
- **Save Character**

### Cast Asset Output Control
- **Delete All** — Explicitly clears temporary cast assets from your current preview layout. The action will safely ask for confirmation before removing them.

### When to Use NANO CAST
Use NANO CAST when you need high identity preservation but still want to stylize or brand the result. 

---

## WARDROBE
**Purpose:** Design costumes and fit them onto characters.

### Part A: Costume Designer
Use this to create garments before applying them.

Key tools:
- **Design Reference Upload**
- **SKETCH Mode**
- **COSTUME Mode**
- **Save to Wardrobe**

### Part B: Virtual Try-On Room
Use this to fit garments to saved characters.

Key tools:
- **Remove BG** toggle
- **Character Sheet Identity Anchor**
- **FRONT View**
- **TURNAROUND View**
- **Execute Virtual Try-On**

### Part C: Cleanup Tools
- **Remove Background**
- **Edge Refinement / Spill Suppression**
- **Manual Restoration / Eraser Brush**

### When to Use WARDROBE
Use WARDROBE when the character exists and you now need outfit control, branding, or reusable styling variations.

---

## PROPS
**Purpose:** Create and isolate reusable objects.

### Main Uses
- handheld items
- set dressing
- logos or symbolic objects
- scene accessories

### Workflow
1. Generate the object.
2. Remove the background.
3. Refine edges if needed.
4. Save the isolated prop to the library.

### Application Room Behaviors
- **Prop Removal** — Assigned props can easily be removed from the active slot using the designated remove/clear control.
- **Reset Behaviors** — The prop selection state is entirely session-clean and should not persist unexpectedly after clearing. If a stale prop does occasionally still appear on load, perform a refresh or re-open the workspace to verify the active slot accurately represents as empty.

### When to Use PROPS
Use PROPS before staging if the scene depends on specific objects.

---

## STAGE [PREVIEW]
**Purpose:** Arrange your actors and props into a composed scene.

> **Preview Notice**
> Staging is powerful and useful for concepting, scene planning, and selective production work, but consistency is still evolving.

### Workspace Customization
- modular sidebars
- draggable panel order
- persistent panel states

### Top Command Area
- **Depth Assist** status
- **View Toggle** — Stage / Result / Shots
- **Generate Composite**

### Token Properties
Use this panel to control:
- position
- nudge
- scale
- anchor
- rotation
- z-depth ordering
- occlusion mode
- depth bias

### Actor Intelligence
Use this panel to control:
- semantic DNA
- pose/action intent
- grounding
- manual override behavior
- auto analysis

### Scene Director
Use this panel to control:
- subject/action
- environment
- lighting
- camera
- layout

### Bottom Toolbar
Use it for:
- undo / redo
- copy
- clear stage
- note / zone / path annotations
- save image
- save depth

### Reference Stack Workflow
Use this if you want the AI to place actors based on named references and directional notes rather than canvas positioning alone.

### SHOTS: Multi-Angle Cinematic Generation
The **SHOTS** tab allows you to generate a consistent "pack" of camera angles from a single staged scene. This is a powerful way to create a cinematic sequence or coverage for a story directly derived from the scene geometry.

#### 1. Requirements
Before using the SHOTS workflow, you must have:
- Created a scene in the **STAGE** sub-tab.
- Generated at least one composite image (**GENERATE COMPOSITE**). This image serves as the "Scene Truth" from which all camera angles are derived.

#### 2. The Directed Shot Plan
The **Directed Shot Plan** is where you define the specific angles and actions for your shot pack.
- **Pack Select**: Choose a preset collection of shots (Cinematic, Coverage, etc.).
- **Shot Cards**: Each card in the list represents one camera angle. You can customize the **Angle** (Close-up, Wide, etc.), the **Target** (Scene or specific Actor), and the **Action / Intent**.
- **Action / Intent**: Describe what is happening in the shot (e.g., "looking surprised," "running toward camera").

#### 3. Generation Workflow
1. Click the green **GENERATE** button to render low-resolution previews for the entire pack.
2. Review the results in the **Shot Grid**.
3. **Semantic Locks**: Use these to toggle which parts of the scene (Identity, Wardrobe, Background, Lighting) should remain strictly locked to the "Scene Truth" during generation.
4. **Final Render**: Select your favorite previews and click **RENDER 4K** to generate high-fidelity, production-ready cinematic shots.

### When to Use STAGE
Use STAGE when your actors and props already exist and the next step is composition, direction, and final composite generation.

---

## REGION EDIT / POST-PRODUCTION
**Purpose:** Correct only part of an image instead of rerendering the full scene.

### Tools
- **Masking Tools (Paint / Erase)**
- **Mask Layers (A / B / C)**
- **Brush Size & Edge Softness**
- **Protect Face/Hair**
- **Layer Instruction + Remove / Replace / Relight**
- **Apply Enabled Layers**

### When to Use It
Use REGION EDIT when the overall image works but one section needs cleanup, replacement, or relighting.

---

## 5. Recommended Studio Pipeline
This is the **recommended** end-to-end workflow for users who want a structured studio process. It is not mandatory.

### Step 1: Create or Import Character Identity
Use **CAST**, **PORTRAIT**, or **NANO CAST** depending on whether the character starts synthetic or from a real reference.

### Step 2: Refine Face, DNA, and Likeness
Use **PORTRAIT** or **NANO CAST** to lock structural identity and age/style behavior.

### Step 3: Style with Wardrobe and Branding
Use **WARDROBE** to create clothing, apply logos, and generate try-on outputs.

### Step 4: Build Props
Use **PROPS** to create and isolate objects needed for the scene.

### Step 5: Stage the Scene
Use **STAGE [PREVIEW]** to place actors and props, define notes, and set the environment.

### Step 6: Generate Final Output or Shots
Use **Generate Composite** and the **SHOTS** workflow for final visual output and camera-angle variations.

### Step 7: Retouch Specific Areas
Use **REGION EDIT / POST-PRODUCTION** to fix local mistakes or make targeted changes.

---

## 6. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"Not Linked" Status** | Go to Settings and re-select your Save Folder. |
| **Credit / Generation Mode Confusion** | Ensure your generation mode (Hosted vs BYOK) in the Settings properly aligns with your intent. |
| **Library Not Updating / Stuck Views** | After saving or deleting, use the scan/refresh control to force a folder re-read to display changes properly. |
| **Portrait Details Return After Clearing** | Clearing should permanently erase a portrait from memory. If it returns visually, click the Clear button again to lock it down durably. |
| **Prop Still Appearing After Removal** | Ensure the selected prop slot appears visually empty. If a ghost prop persists, a fast refresh or workspace re-open will force the interface to acknowledge the clean slate. |
| **Staging feels inconsistent** | Remember that STAGE is currently a preview-tier system. Use it for concepting, selective production, and shot planning. |
| **Download or save issues** | Confirm your save folder is linked and that permissions are still granted. |

---

## Final Note
Cast Director Studio is designed to be flexible. You do not have to follow the full studio pipeline every time.

You can:
- create only a character
- style only an outfit
- make only a prop
- build only a staged concept
- or move through the full pipeline from identity to final composite

Use the workflow that matches your goal.

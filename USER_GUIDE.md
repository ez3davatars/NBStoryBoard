# Cast Director Studio User Guide
**Version 1.1.1**

This guide covers the current application tabs, shared shell controls, and major panels in Cast Director Studio. Each feature group includes a step-by-step workflow instead of only a short description.

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [First Setup](#2-first-setup)
3. [App Shell and Shared Workflows](#3-app-shell-and-shared-workflows)
   - [Recent Generations: Save It or Lose It](#recent-generations-save-it-or-lose-it)
4. [Work by Goal](#4-work-by-goal)
5. [CAST](#5-cast)
6. [NANO CAST](#6-nano-cast)
7. [PORTRAIT](#7-portrait)
8. [WARDROBE](#8-wardrobe)
9. [PROPS](#9-props)
10. [STAGING](#10-staging)
11. [SHOTS](#11-shots)
12. [STORYBOARD - EXPERIMENTAL](#12-storyboard-experimental)
13. [REGION EDIT / POST-PRODUCTION](#13-region-edit--post-production)
14. [Recommended Studio Pipelines](#14-recommended-studio-pipelines)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Introduction

### Current Workspace Coverage
The app exposes these main workspaces:

1. **CAST** - Generate, stylize, slice, save, and organize actors.
2. **NANO CAST** - Build characters from biometric captures, uploaded references, style synthesis, wardrobe, and reference sheets.
3. **PORTRAIT** - Build synthetic or reference-locked face DNA.
4. **WARDROBE** - Design costumes, manage wardrobe assets, and run virtual try-on.
5. **PROPS** - Generate prop assets and apply props to characters.
6. **STAGING** - Build scenes with actors, props, references, director controls, stage layers, annotations, and composite generation.
7. **SHOTS** - Generate multi-angle shot packs from a staged scene.
8. **STORYBOARD [EXPERIMENTAL]** - Experimental Veo prompt, keyframe, timeline, and shot workflow.
9. **REGION EDIT / POST-PRODUCTION** - Mask and fix localized areas of a result.

### Detailed Workflow Coverage
This guide includes detailed steps for:

- File menu sessions: New, Open, Save, Save As, and save-on-close.
- Settings: Hosted/BYOK, sign-in, API key, model, resolution, thinking, grounding, help hints, and Storyboard enablement.
- Recent Generations strips and the **Save It or Lose It** workflow.
- Image Inspector actions.
- Actor, wardrobe, and prop library maintenance.
- CAST reference sheets, slicing, folders, search, delete, and custom covers.
- NANO CAST phase workflow, biometric sheets, wardrobe handoff, and reference sheet export.
- WARDROBE Designer and Try-On details, especially turnaround sheets and Character Sheet anchors.
- PROPS Application Room and reference slot binding.
- STAGING panels, reference stacks, stage layers, annotations, height relationship guidance, advanced render, and prompt terminal.
- SHOTS configuration, directed shot cards, semantic locks, auto-reroll, 4K render, and promotion to Stage.
- Shot pack export for handoff, including compiled prompts, notes, references, and manifests.
- Character Pitch Sheet Preview, source handoff, and callout-label accuracy guidance.
- STORYBOARD prompt builder, keyframe engine, monitor, timeline, and scene-anchor routing.
- REGION EDIT layer queue and protection mask behavior.

All of those areas are now covered below.

---

## 2. First Setup

### Connect a Save Folder
Use a save folder before doing serious work. It lets the app persist actors, wardrobe, props, sessions, references, shot outputs, and generated assets.

1. Click the **Settings** gear in the top-right header.
2. Find **Render Save Folder**.
3. Click **Choose Save Folder**.
4. Select the project folder where you want Cast Director Studio to store assets.
5. Click **Save Config**.
6. Go to **NANO CAST**, **CAST**, **WARDROBE**, or **PROPS** and confirm saved libraries can be scanned.
7. If a library looks empty after saving something, click its scan or refresh button.

### Expected Folder Behavior
The app may create or use folders such as:

- `Actors`
- `Wardrobe`
- `Props`
- `Sessions`
- `ReferenceSheets`
- local generated previews or shot assets

Actor saves usually produce:

- an image file such as `Actor-{timestamp}.png`
- a metadata sidecar such as `Actor-{timestamp}.json`

The image filename may stay generic while the JSON stores the real actor name, category, style, and related metadata.

### Configure Billing and Generation Mode

1. Click **Settings**.
2. Review the header credit/mode display: **HOSTED** or **BYOK**.
3. If using **Hosted Cloud**, sign in with your hosted account if the sign-in form appears.
4. If using **BYOK**, paste your Gemini API key into **Gemini API Key** when the field is available.
5. Choose the **Active Engine**.
6. Set **Image Resolution** to **1K**, **2K**, or **4K**.
7. Toggle **Thinking Mode** if you want stronger prompt adherence and can accept slower generations.
8. Toggle **Google Image Search Grounding** when real-world accuracy matters.
9. Toggle **Enable Storyboard (Veo 3.1)** if you want the experimental Storyboard workspace.
10. Click **Save Config**.

### Understand Temporary vs Saved Results

1. Treat every newly generated image as unsaved until you explicitly save or export it.
2. Use [Recent Generations](#recent-generations-save-it-or-lose-it) as a local recovery cache for comparing, restoring, and saving recent images.
3. Use **Add to Library**, **Export to Library**, **Save to Wardrobe**, **Export to Props**, or a save/download button when you want to keep something.
4. After saving, use the library **Scan** or **Refresh** button if the card does not appear immediately.
5. Avoid clearing a workspace until the asset you care about has been saved.

---

## 3. App Shell and Shared Workflows

### Navigate Between Workspaces

1. Use the main header tabs: **CAST**, **NANO CAST**, **PORTRAIT**, **WARDROBE**, **PROPS**, **STAGING**, and optionally **STORYBOARD**.
2. If **STORYBOARD** is not visible, open **Settings** and enable **Enable Storyboard (Veo 3.1)**.
3. Watch the footer for logs, generation status, and session status.
4. Watch the top-right mode/credit display before running expensive workflows.

### Use the File Menu

1. Click **FILE** in the top-right header group.
2. Choose **New Session** to clear the current work after confirming.
3. Choose **Open Session...** to load a `.cds` session file.
4. When opening a session, choose whether to save the current session first.
5. Choose **Save Session** to save over the current `.cds` file.
6. Choose **Save Session As...** to create a new `.cds` file.
7. Choose **Help & Guides** to open the Help Center.

### Save a Session Safely

1. Connect a save folder first.
2. Click **FILE**.
3. Click **Save Session As...** for the first save.
4. Name the session.
5. Confirm the file is saved under your `Sessions` folder or chosen save location.
6. Use **Save Session** afterward to update the same file.

### Use Help Center

1. Click the question mark icon in the header.
2. Use **Start Here** for quick onboarding.
3. Use **Work by Goal** to jump to a recommended workspace.
4. Use **Current Tab Help** for help specific to the active workspace.
5. Use **Troubleshooting** for common fixes.
6. Use **Full User Guide** to open this full guide inside the app.

### Use the Image Inspector

1. Click an image's inspect or expand control when available.
2. Review the image at full size.
3. Click **Add to Cast** to add it to the current Cast list.
4. Click **Load to Forge** to load it into CAST for further work.
5. Click **Save to Actors Folder** or **Download** to store it.
6. Click **Copy Raw Data** if you need the image data URL.
7. Click **Close** or outside the inspector to return.

### Recent Generations: Save It or Lose It

1. Look for the **Recent Generations** strip near the bottom or output area in CAST, PORTRAIT, WARDROBE, and PROPS.
2. Remember that Recent Generations is a local cache, not a permanent library.
3. Expect Recent Generations to survive app restarts; seeing images from a previous session is normal.
4. Cached recent images are eligible for cleanup after about 30 days, and each studio keeps only a limited recent history.
5. Click a thumbnail to restore that result into the current workspace.
6. Reference sheet results from CAST and NANO CAST also appear here so you can inspect them before deciding whether to save them.
7. Hover a thumbnail and click **Export to Library** when the export icon appears.
8. Use the workspace save action, such as **Add to Library**, **Save to Wardrobe**, **Export to Props**, or **Download**, if the recent item does not show a direct export button.
9. Look for the saved/exported indicator after exporting a recent item.
10. Refresh or scan the destination library if a saved actor, wardrobe item, portrait, reference sheet, or prop does not appear immediately.
11. Remove or clear recent items only after every important image has been saved or exported.
12. Do not rely on Recent Generations as the only copy of work you want to reuse long-term.

### Refresh a Library

1. Open the workspace with the library: actor, wardrobe, or prop.
2. Click the scan/refresh icon.
3. Wait for the cards to reload.
4. If a saved image still does not appear, confirm the save folder is connected and that the file exists on disk.

### Use Durable Reference Uploads

1. Connect a save folder before building scenes that depend on uploaded references.
2. When you upload a reference into STAGING, Reference Stacks, or a related workflow, the app can keep a lighter display copy in memory while preserving the source file on disk.
3. If the workflow saves reference files, look for a `References` folder inside your save folder.
4. Keep the saved project folder together when moving a session to another machine.
5. If a reference preview appears missing after reopening, reconnect the same save folder and reload or rescan the session.
6. Re-upload the source image only if the original reference file is no longer available.

---

## 4. Work by Goal

### Create a New Character From Scratch

1. Open **CAST**.
2. Choose a target studio style.
3. Type a clear actor prompt.
4. Click **Generate**.
5. Review the result.
6. Use **Slicer** if you need to crop out a reusable part.
7. Click **Add to Library** and choose a name/category.
8. Use the actor later in **WARDROBE**, **PROPS**, or **STAGING**.

### Build a Character From a Photo or Real Person

1. Open **NANO CAST** or **PORTRAIT**.
2. Upload a clear front-facing reference or capture center/left/right angles.
3. Set identity strength or reference locks.
4. Choose age, style, body scope, hair, wardrobe, or logo controls.
5. Generate the actor.
6. Review identity quality.
7. Export the actor or a reference sheet to the library.
8. To load Nano Cast biometric data into a Character Pitch Sheet, use **Build Pitch Sheet From Scan** or **Build Pitch Sheet From Scan + Character** in NANO CAST; see [Build a Pitch Sheet From NANO CAST](#build-a-pitch-sheet-from-nano-cast).

### Refine a Face

1. Open **PORTRAIT**.
2. Choose **Synthetic** or **Reference** mode.
3. Set identity, age, morphology, face, skin, hair, and render details.
4. Generate a DNA portrait.
5. Use **Send to Casting** or **Send to Ref Sheet** if you want to continue in CAST/NANO CAST.
6. Export or download the final portrait.

### Design and Fit Clothing

1. Open **WARDROBE**.
2. Use **Costume Designer** to create or import the costume.
3. Save the costume to the wardrobe library.
4. Switch to **Virtual Try-On Room**.
5. Select a character and costume.
6. Add a Character Sheet identity anchor if you have one.
7. Choose **Front** or **Turnaround**.
8. Click **Execute Virtual Try-On**.
9. Export the fitted character to the actor library.

### Create and Apply Props

1. Open **PROPS**.
2. Generate or upload a prop.
3. Export it to the prop library.
4. Switch to **Application Room**.
5. Select a character and prop.
6. Write placement notes.
7. Click **Apply to Character**.
8. Save the result to Actors, download it, or bind it to a reference slot.

### Build a Scene

1. Open **STAGING**.
2. Create or upload a background in **Scene Generator**.
3. Drag actors or props onto the stage.
4. Position, scale, rotate, and order them.
5. Use **Scene Director**, **Actor Intelligence**, **Reference Stacks**, and **Context Specs**.
6. Click **Generate Composite**.
7. Use **Result** view to inspect the output.
8. Save, download, or send the result into SHOTS.

### Generate Cinematic Coverage

1. Build a scene in **STAGING**.
2. Generate a composite first.
3. Open **SHOTS**.
4. Pick a pack and count.
5. Edit the Directed Shot Plan.
6. Click **Generate** for previews.
7. Select the previews you like.
8. Click **Render 4K**.
9. Download or promote selected shots.

### Create a Character Pitch Sheet

1. Open **PORTRAIT**.
2. Switch to **Character Pitch Sheet** mode.
3. Enter the character name, codename, age, height, build, design language, world or era, wardrobe, props, lighting, and performance notes.
4. If you already built the character in NANO CAST, use **Build Pitch Sheet From Scan** or **Build Pitch Sheet From Scan + Character** from NANO CAST instead of retyping the identity.
5. Use uploaded biometric or portrait references only as identity authority; use wardrobe and prop fields for costume, fabric, accessory, and object details.
6. Include visible materials and props in the wardrobe/material fields so callout labels can target real visible objects.
7. Click **Generate Character Pitch Sheet**.
8. Review whether the sheet preserves the same identity, body guide, costume package, render style, and callout accuracy across panels.
9. Save, export, or restore it from Recent Generations before clearing the workspace.

### Build a Veo Storyboard

1. Enable Storyboard in **Settings**.
2. Create shots from **STAGING** or open **STORYBOARD** directly.
3. Select a shot in the Storyboard shot rail.
4. Load or upload Start and End plates.
5. Use Prompt Builder and Timeline.
6. Copy the formatted prompt, negative prompt, or timestamp sequence.
7. Save prompt data back to the active shot.

### Fix Part of an Image

1. Open **STAGING** and make sure you have a result image.
2. Open **Region Edit**.
3. Turn **Mask ON**.
4. Paint the area to edit.
5. Write a localized layer instruction.
6. Enable **Protect Anatomy** if faces or hair must be preserved.
7. Click **Apply Enabled Layers**.
8. Inspect the edited result.

---

## 5. CAST

**Purpose:** Generate, stylize, organize, slice, and save actors.

### Generate an Actor From Text

1. Open **CAST**.
2. In **Target Studio Style**, choose a style folder such as Realism, Animation, Illustration, Sci-Fi, or Unsorted.
3. Type the character description in the prompt box.
4. Include identity, age range, wardrobe, body type, expression, and visual style when relevant.
5. Click **Generate**.
6. Wait for the result to appear in the main preview.
7. If the result is useful only temporarily, click **Add to Cast**.
8. If the result should be permanent, click **Add to Library**.
9. In the save dialog, choose a name and category.
10. Refresh the Actor Library if the card does not appear.

### Stylize an Uploaded Reference

1. Open **CAST**.
2. Click **Upload** or **Upload Ref**.
3. Choose an image from disk.
4. Select a target style.
5. Add a prompt describing how the uploaded subject should be transformed.
6. Click **Stylize** or **Generate**.
7. Review the image.
8. Save it to the Actor Library if you want to reuse it.

### Slice Part of a Generated Image

1. Generate or upload an image in CAST.
2. Click **Slicer** so it reads active.
3. Drag a crop rectangle around the part you want.
4. Choose or confirm the tag for the cropped token.
5. Apply the crop.
6. Save the cropped piece when the save modal opens.
7. Use the sliced asset as a Cast item or library asset.

### Generate an Actor Reference Sheet

1. Generate or load the actor you want to document.
2. Open **Actor Reference Sheet**.
3. Choose a layout:
   - **Form Focus** for body/turnaround utility.
   - **Face Focus** for head and likeness utility.
   - **Split Focus** for mixed body and face reference.
4. Optional: upload a logo in **Branding & Identity**.
5. Click **Generate Reference Sheet**.
6. Review the generated sheet in the modal.
7. Click **Add to Library** to store it as an actor/reference asset.
8. Click **Download** if you only need a local file.
9. Click **Save Asset** to store it under the app's reference sheet workflow when available.
10. Close the modal after confirming it is saved.

### Generate Accurate Callout Reference Sheets

1. Start from a saved or currently loaded actor with a clear full outfit.
2. Open **Actor Reference Sheet**.
3. Choose the layout that matches the job:
   - **Form Focus** when body shape, costume silhouette, and footwear matter most.
   - **Face Focus** when likeness and head details matter most.
   - **Split Focus** when both likeness and outfit details need space.
4. Enable callout labels when the option is available.
5. In the actor prompt or notes, name visible garments, materials, footwear, accessories, props, logos, and construction details plainly.
6. Avoid vague labels such as "detail" or "body"; describe the visible target instead, such as jacket collar, leather belt, boot sole, emblem, pouch, sleeve cuff, or prop case.
7. Generate the sheet.
8. Inspect callouts before saving:
   - garment labels should point to garments.
   - material labels should point to visible materials or swatches.
   - prop labels should point only to the prop or prop inset.
   - performance labels should point to pose, expression, gesture, or posture.
9. Regenerate only if the sheet creates wrong targets, vague labels, missing footwear, mismatched style, or identity drift.
10. Save the sheet once the labels and panels are useful for downstream staging, wardrobe, or review.

### Manage the Cast Assets List

1. Use **Add to Cast** to keep temporary working actors in the current session.
2. Click a cast asset to use or inspect it.
3. Use the delete control on a single asset to remove it from the session list.
4. Use **Delete All Cast Assets** to clear the temporary cast list after confirming.
5. Remember that clearing Cast Assets does not delete saved Actor Library files.

### Manage the Actor Library

1. Open the Actor Library panel on the right side of CAST.
2. Click a studio folder to filter by category.
3. Use search to find actors by name or metadata.
4. Click refresh to rescan disk-backed actors and custom covers.
5. Click an actor card's inspect control to view it large.
6. Click add controls to move an actor into Cast or Stage.
7. Use delete only when you intend to remove the saved library item.
8. If custom folder cover controls are visible, upload or remove a cover after connecting a save folder.

---

## 6. NANO CAST

**Purpose:** Build identity-preserved characters from biometric captures, uploaded photos, archetypes, style synthesis, wardrobe, logos, and reference sheets.

### Start a Nano Cast Session

1. Open **NANO CAST**.
2. Confirm the save folder status. If storage is not connected, go to **Settings** and choose a save folder.
3. Move through the phase buttons in order. Locked phases tell you what is missing.
4. Use the footer logs if a phase does not advance.

### Capture or Upload Biometric Angles

1. Go to **Biometric Acquisition**.
2. Choose webcam/manual capture or upload mode, depending on what is available in your build.
3. Provide three angles:
   - **Center**
   - **Left**
   - **Right**
4. Use clear, well-lit, front-facing source photos whenever possible.
5. Avoid heavy shadows, sunglasses, extreme expressions, and cropped heads.
6. Confirm all required angle slots are filled.
7. Review the **Biometric Manifest**.
8. Continue to the next phase.

### Generate a Local or Premium Biometric Sheet

1. Capture or upload center/left/right angles.
2. In the biometric section, click the fast/local biometric sheet action for a local composite.
3. Review the local sheet.
4. Click **Save to Drive** if you want the local sheet as a file.
5. For a more polished AI forensic sheet, click the premium biometric sheet generation control.
6. Review the generated premium board.
7. Export or download it if you need it for external reference.

### Choose Style and Body Scope

1. Continue to **Style Synthesis**.
2. Select a style preset or archetype.
3. Choose a body scope when prompted, such as head, torso, or full body.
4. If exact likeness is required, use realistic or exact-likeness styles and keep identity strength high.
5. Click **Initialize Style Synthesis** or the available generate action.
6. Wait for the final character render.
7. Inspect the output for face identity, age, body scope, and wardrobe accuracy.

### Use Director Controls

1. Open the director controls panel.
2. Adjust **Identity Lock** to control likeness strength.
3. Add a **Hair Style Prompt** if hair should change.
4. Upload a logo under **Branding & Identity** if clothing or branding should include it.
5. Specify logo placement.
6. Use **Wardrobe** controls to select a wardrobe item or enter a wardrobe prompt.
7. Click **Generate & Fit** or **Fit Selected Item** when using wardrobe.
8. Review the result.
9. Export the selected image to the library when satisfied.

### Use the Wardrobe Library Inside NANO CAST

1. Open the Wardrobe section inside NANO CAST.
2. Click upload to add a costume image.
3. Click scan to refresh saved wardrobe items.
4. Select a wardrobe item from the library.
5. Enter optional wardrobe notes.
6. Click **Fit Selected Item**.
7. Save the wardrobe output or generated actor as needed.

### Export a Nano Cast Character

1. Generate a final character.
2. Click **Export to Library**.
3. Choose an actor name and category.
4. Confirm the save.
5. Refresh the Actor Library if needed.
6. Use the saved actor in CAST, WARDROBE, PROPS, or STAGING.

### Generate a Character Reference Sheet From NANO CAST

1. Generate a character or complete biometric capture.
2. Open the Reference Sheet section.
3. Choose a layout.
4. Choose a style preset.
5. Choose an identity source:
   - **Hybrid** blends scan and generated character.
   - **Biometric** forces raw scan likeness.
   - **Portrait** uses the generated portrait/character as authority.
6. Add wardrobe or logo references if needed.
7. Click **Generate Reference Sheet**.
8. Review the sheet.
9. Click **Export to Library** or **Download**.

### Build a Pitch Sheet From NANO CAST

1. Complete biometric acquisition or generate the character you want to document.
2. In the Reference Sheet area, choose the pitch sheet handoff that matches your source:
   - **Build Pitch Sheet From Scan** when the biometric scan should be the identity authority.
   - **Build Pitch Sheet From Scan + Character** when the generated character image should carry wardrobe, style, body presentation, and costume design while the scan preserves identity.
3. Wait for the handoff confirmation.
4. Open **PORTRAIT** if it does not open automatically.
5. Confirm **Character Pitch Sheet** mode is active.
6. Review the imported identity, style, wardrobe, material, prop, and production fields.
7. Add any missing visible garment, fabric, accessory, footwear, or prop details before generating.
8. Click **Generate Character Pitch Sheet**.
9. Inspect identity consistency first, then style consistency, then callout accuracy.
10. Export or save the pitch sheet before clearing NANO CAST or PORTRAIT.

### Clear or Reset NANO CAST Work

1. Save any actor, sheet, or wardrobe output you want to keep.
2. Use clear/reset controls to remove current temporary images.
3. Use delete controls only for library items you intend to remove.
4. Rescan libraries after deleting files.

---

## 7. PORTRAIT

**Purpose:** Create or refine a face using structured Character DNA.

### Build a Synthetic Portrait

1. Open **PORTRAIT**.
2. Choose **Synthetic** mode.
3. Fill out the **Identity Matrix**:
   - sex
   - ethnicity
   - skin tone
   - life stage
   - chronological age
4. Set **Morphology** values such as height, weight, build, and proportions.
5. Adjust face structure controls.
6. Adjust skin controls such as freckles, scars, dermal age, and under-eye control.
7. Adjust hair color, style, length, and texture.
8. Configure render style details.
9. Click **Generate DNA Portrait**.
10. Review the generated portrait.

### Build a Reference-Locked Portrait

1. Open **PORTRAIT**.
2. Choose **Reference** mode.
3. Upload or drop an **Identity Reference Photo**.
4. Confirm the reference preview appears.
5. Set life stage and age for age progression or regression.
6. Use the lock/unlock controls:
   - Keep traits locked when the reference should remain authoritative.
   - Unlock morphology, face, skin, or hair when you want those details changed.
7. Click **Generate DNA Portrait**.
8. Compare the result against the reference.
9. Save, send, or regenerate as needed.

### Character Pitch Sheet Preview

1. Open **PORTRAIT**.
2. Switch from portrait generation to **Character Pitch Sheet** mode.
3. Choose the identity source:
   - text-only for an invented character.
   - portrait reference for a single uploaded likeness.
   - biometric multi-view when NANO CAST sent scan references.
   - scan plus character when NANO CAST sent both biometric identity and a generated character source.
4. Fill the structured fields carefully:
   - character name and codename.
   - visual age, height, and build.
   - world or era.
   - design language and render style.
   - wardrobe direction.
   - props and signature items.
   - material/costume notes.
   - performance direction.
5. Use wardrobe and material fields to name visible costume features that should become useful callouts.
6. Use the props field for real props only; do not put background ideas or hidden lore there.
7. Choose a render style and board presentation style.
8. Click **Generate Character Pitch Sheet**.
9. Review the result in this order:
   - identity and likeness.
   - body guide and proportions.
   - wardrobe and footwear continuity.
   - single unified render style across every panel.
   - callout labels pointing to the correct visible target.
10. Use Recent Generations to restore the pitch sheet if you need to compare it, then export or save it before clearing the workspace.

### Use Presets

1. In Synthetic mode, configure a DNA setup you want to reuse.
2. Enter a preset name.
3. Click **Save Preset**.
4. Load the preset later before generating.
5. Use presets for recurring character families or style templates.

### Randomize DNA

1. Choose Synthetic mode.
2. Click **Randomize DNA**.
3. Review the changed identity, morphology, skin, hair, and render values.
4. Fine-tune anything that does not match your target.
5. Click **Generate DNA Portrait**.

### Use Portrait Output Actions

1. Click **Download** or **Download Original** to save the portrait file.
2. Click **Export to Library** to store the portrait as an Actor Library asset.
3. Click **Send to Casting** to load it into CAST.
4. Click **Send to Ref Sheet** to hand it to NANO CAST reference sheet generation.
5. Click **Generate Again** when you want a new variation with the same DNA.
6. Click clear/reset when you want a clean portrait workspace.

### Use Portrait Recent Generations

1. After generating, find the recent strip.
2. Click a recent item to restore it.
3. Export a recent item to the library if you want it permanently.
4. Remember that the recent strip can survive app restarts because it is a local cache.
5. Clear recents only after saving important images.
6. See [Recent Generations: Save It or Lose It](#recent-generations-save-it-or-lose-it) for the full rule.

---

## 8. WARDROBE

**Purpose:** Design costumes, manage wardrobe assets, and fit costumes onto actors.

### Manage the Wardrobe Library

1. Open **WARDROBE**.
2. Use the left **Wardrobe Library** panel.
3. Click upload to add an existing costume image.
4. Click scan to refresh saved wardrobe files.
5. Click a wardrobe card to select it.
6. Use the delete control on a card only if you want to permanently delete that costume.
7. If the library is empty, create a costume in Designer or upload one.

### Generate a Costume in Costume Designer

1. Open **WARDROBE**.
2. Select **Costume Designer**.
3. Optional: load a **Design Reference**.
4. Choose the reference type:
   - **Sketch/Pattern** for drawings, flat designs, silhouettes, or patterns.
   - **Costume** for a real or generated garment photo.
5. Enter a detailed costume prompt in **Designer Workshop**.
6. Optional: upload a PNG logo in the branding area.
7. Specify logo placement if available.
8. Click **Generate Costume**.
9. Review the generated costume.
10. Click **Save to Wardrobe** to store it.
11. Use **Download** for a direct file save.
12. Use **Clear** to reset the designer only after saving anything important.

### Fit a Costume Onto a Character

1. Open **WARDROBE**.
2. Select **Virtual Try-On Room**.
3. Choose a character from the actor list.
4. Choose a wardrobe item from **Wardrobe Library**.
5. Optional: upload a **Character Sheet (Identity Anchor)** for stronger turnaround identity.
6. Write a try-on note if the fit needs special direction.
7. Choose **Front** for a single front-facing output.
8. Choose **Turnaround** for two sheets: Front/Back and Left/Right.
9. Click **Execute Virtual Try-On**.
10. Wait for the output.
11. Toggle between generated views when turnaround sheets exist.
12. Review identity, face window, costume silhouette, footwear, logo placement, and coverage.

### Save a Fitted Character

1. Generate a fitted character.
2. Click **Export to Library**.
3. Enter the actor name and category.
4. Confirm save.
5. Refresh the Actor Library if needed.
6. Use the saved fitted actor in STAGING or later wardrobe iterations.

### Download or Clear Try-On Output

1. Click **Save** or the download control to save a local image.
2. Click **Clear** to remove the current try-on result and selections.
3. Confirm important results are exported before clearing.

---

## 9. PROPS

**Purpose:** Create reusable props and apply them to characters.

### Manage the Prop Library

1. Open **PROPS**.
2. Use the **Prop Library** panel.
3. Click upload to add an existing prop image.
4. Click scan to refresh saved props.
5. Click a prop card to select it.
6. Use delete only when you want to permanently remove a prop.
7. In some workflows, Shift-click or a quick-bind control can bind a prop to the first empty Reference Stack slot in STAGING.

### Generate a New Prop

1. Select **Prop Designer**.
2. Enter a prompt describing one standalone object.
3. Include material, scale, color, style, and whether it is handheld, worn, or set dressing.
4. Click **Generate Prop**.
5. Review the generated prop.
6. Click **Export to Library**.
7. Use **Clear** only after saving any prop you want to keep.

### Apply a Prop to a Character

1. Select **Application Room**.
2. Choose a character from the character row.
3. Choose an active prop from the Prop Library.
4. Write placement notes in the text area, such as:
   - "Place the helmet on the head."
   - "Put the sword in the right hand."
   - "Attach the badge to the left chest."
5. Click **Apply to Character**.
6. Wait for the integration result.
7. Review position, scale, hand/body contact, lighting, and perspective.
8. Click **Save to Actors** to store the character plus prop.
9. Click **Download** to save a local PNG.
10. Click **Clear Stage** to remove the current preview.

### Use Props in STAGING

1. Save the prop to the Prop Library.
2. Open **STAGING**.
3. Drag the prop into the stage or into a Reference Stack when supported.
4. Set its scale, placement, and notes like any other stage token.
5. Include prop instructions in **Scene Director** or **Actor Intelligence** before generating a composite.

---

## 10. STAGING

**Purpose:** Arrange actors, props, scene references, annotations, director instructions, stage layers, and final composites.

### Create or Upload a Scene Background

1. Open **STAGING**.
2. In **Scene Generator**, drag, paste, or upload a **Scene Reference** if you already have an anchor image.
3. Or type a background prompt if you want text-to-image generation.
4. Choose the merge strategy when using a reference:
   - **Character Identity**
   - **Style Transfer**
   - **Composition Reference**
   - **Photo Merge**
5. Toggle **Scene Lock** if the anchor image should stay structurally stable.
6. Click **Generate Background**.
7. Review the background.
8. Click **Revert Background** if you need to return to the previous background.

### Use Auto-Style Environment

1. Select a staged actor/token.
2. Enter or confirm a scene prompt.
3. Click **Auto-Style Environment**.
4. Let the app infer environment style around the selected token.
5. Review the **Scene Intent** display.
6. Adjust Scene Director fields if the inferred environment is too broad.

### Replace Anchor Subjects

1. Upload or generate a source scene that already contains people.
2. Enable **Replace Anchor Subjects** in Scene Generator.
3. Add references in **Reference Stacks**.
4. For each reference, specify the target in the anchor scene, such as "person on left" or "woman in blue jacket".
5. Use staged actor mappings when available for deterministic placement.
6. Generate the composite.
7. Inspect identity, wardrobe continuity, pose, gaze, and lighting.

### Add Actors and Props to the Stage

1. Save actors or props in their libraries first.
2. In STAGING, use the Cast/asset palette.
3. Drag an actor or prop onto the stage.
4. Drop it near the intended position.
5. Repeat for all subjects and props.
6. Select a token to edit its properties.

### Move and Transform a Token

1. Click a token on the stage.
2. Drag to reposition it.
3. Use handles or controls to resize.
4. Adjust rotation if needed.
5. Use nudge controls for small placement changes.
6. Set uniform scale on or off depending on the desired proportions.
7. Use flip/scale X/Y controls if the token needs mirrored orientation.

### Set Token Properties

1. Select a token.
2. Open **Token Properties**.
3. Edit position, scale, rotation, and anchor.
4. Set grounding mode when applicable:
   - auto
   - floor
   - seat
   - lean
   - float
5. Add token notes or action notes.
6. Use brightness, contrast, saturation, or blur controls if available.
7. Remove the token from the scene only if you do not need it on the stage anymore.

### Use Actor Intelligence

1. Add at least one actor to the stage.
2. Open **Actor Intelligence**.
3. Select the actor you want to direct.
4. Click **Auto Analyze** to infer actor details when available.
5. Enter pose, action, gaze, expression, lighting, or DNA notes for the selected actor.
6. Use direct language, such as "sitting on the floor and looking shocked" or "standing behind the desk with one hand on the chair."
7. Generate a composite and review whether the actor follows the notes.

### Use Scene Director

1. Open **Scene Director**.
2. Enter **Subject / Action**.
3. Enter or refine **Environment**.
4. Choose **Lighting**.
5. Choose **Camera**.
6. Choose **Layout** when you need horizontal, vertical, or centered composition.
7. Generate the composite.
8. If the output drifts, make each field more explicit and regenerate.

### Set Context Specs

1. Open **Context Specs**.
2. Choose resolution: **HD**, **2K**, or **4K**.
3. Choose aspect ratio such as **16:9**, **9:16**, **1:1**, or **4:5**.
4. Confirm the stage framing matches your intended output.
5. Generate the composite.

### Use Reference Stacks

1. Open **Reference Stacks**.
2. Drag a cast member, prop, or image into a reference slot.
3. Activate the slot.
4. Name the reference clearly.
5. Click the inspect/edit control to open **Reference DNA**.
6. Click **Auto-Analyze** to extract DNA/notes.
7. Add manual DNA or target notes.
8. If replacing anchor subjects, enter **Target in Anchor Scene**.
9. Click **Save DNA Changes**.
10. Generate or regenerate the composite.

### Use Stage Layers

1. Open **Stage Layers**.
2. Click a layer to select its stage item.
3. Click the eye icon to show or hide the layer.
4. Double-click the label to rename it.
5. Use bring/send controls when available to organize the selected item visually.
6. Use delete only to remove the selected item from the stage.

### Add and Edit Annotations

1. Use the bottom toolbar to add a note, zone, or path annotation.
2. Place it on the stage.
3. Select the annotation.
4. Edit its text, role, relation, or target details when the annotation panel appears.
5. Use annotations to mark placement, gaze, movement, protect zones, or edit regions.
6. Keep annotations clear and specific so generation instructions stay readable.

### Build a Height Relationship in STAGING

1. Add the actors that need a clear height relationship.
2. Place them on the same floor plane or surface in the stage preview.
3. Use natural scale and placement first so the preview already suggests the intended relationship.
4. In **Scene Director**, write the relationship plainly, such as "Matt is taller than Erki" or "both actors are the same visible height."
5. If you need a visual guide, add an arrow or note annotation near the actor.
6. Write the annotation text as a direct instruction, such as "Matt's height should reach the tip of the arrow."
7. Keep the annotation as a guide, not a final scene object, unless you explicitly want it visible.
8. Add any pose or grounding details in **Actor Intelligence** so the height request does not fight the action.
9. Generate the composite.
10. Review head top, eye line, shoulder line, torso length, leg length, and shared floor contact.
11. If the relationship is wrong, tighten the note and regenerate rather than changing the character identity or wardrobe.

### Use Advanced Render Parameters

1. Open **Advanced Render Parameters**.
2. Toggle **Strict Semantic Lock** only when structural replacement or exact geometry matters.
3. Use **Anchor Scene DNA** to analyze or preserve anchor-scene identity and layout.
4. Enable **Auto Whitelist Profiles** when staged tokens need structured identity/wardrobe/accessory profiles.
5. Click **Analyze Missing** if some actor profiles are incomplete.
6. Review the compiled prompt preview.
7. Generate after confirming the strictness level is appropriate.

### Use the Prompt Terminal

1. Open **PROMPT ENGINE**.
2. Review the compiled prompt.
3. Click copy to copy it to the clipboard.
4. Use the copied prompt for debugging or external review.
5. Return to Scene Director or Reference Stacks to change inputs if the prompt is missing needed details.

### Generate a Composite

1. Confirm the stage has either a background, a scene prompt, or both.
2. Confirm actors and props are positioned.
3. Confirm Scene Director and Actor Intelligence notes are filled in.
4. Confirm Reference Stacks are active if identity preservation matters.
5. Click **Generate Composite**.
6. Wait for processing.
7. Switch to **Result** view if needed.
8. Inspect the output.
9. Save or download the result.
10. Use Region Edit if only a small area needs correction.

### Save Stage Images

1. Use the bottom toolbar download controls.
2. Click the image download control to capture the stage or final result.
3. Confirm the file appears on disk.
4. Save or export important results before clearing the stage.

### Use Undo, Redo, Copy, and Clear

1. Use **Undo** after accidental moves or edits.
2. Use **Redo** to restore undone work.
3. Use **Copy** for selected items when supported.
4. Use **Clear Stage** only after confirming no unsaved scene state is needed.
5. Confirm clear dialogs before destructive session changes.

### Create and Manage Shots From STAGING

1. Open **Shot List**.
2. Click **New Shot** to create a shot from the current stage.
3. The app captures the current stage as a start frame when possible.
4. Click **Start** to capture or replace the active shot's start frame.
5. Click **End** to capture the active shot's end frame.
6. Rename the active shot and click **Save**.
7. Click a shot in the list to load it.
8. Duplicate a shot when you want a variant.
9. Delete a shot only after confirming it is no longer needed.
10. Click the clapperboard control to open the active shot in STORYBOARD.

---

## 11. SHOTS

**Purpose:** Generate multi-angle still coverage from a staged scene or uploaded source image.

### Prepare a Scene Truth Source

1. Build a scene in **STAGING**.
2. Click **Generate Composite**.
3. Confirm the result image exists.
4. Alternatively, upload a source image in Scene Generator and mark it as the source for SHOTS when the option is available.
5. Open the **SHOTS** view/panel.

### Configure a Shot Pack

1. Expand **Shot Configuration**.
2. Choose **Pack**:
   - **Auto (Scene-Aware)** for context-based coverage.
   - **Cinematic** for varied cinematic frames.
   - **Portrait** for character-centered angles.
   - **Coverage** for structured story/editorial coverage.
3. Choose **Count**: 4, 6, or 9 variants.
4. Review **Semantic Locks**:
   - **identity**
   - **wardrobe**
   - **background**
   - **lighting**
5. Leave identity, background, and lighting locked for most workflows.
6. Toggle **Auto-Reroll** on if you want the app to retry shots that are too similar to the source.

### Edit the Directed Shot Plan

1. Review each shot card in the plan.
2. Set the shot target:
   - scene
   - actor
   - pair
3. Choose the actor when the shot targets a person.
4. Choose shot type, camera flavor, action text, or notes.
5. Make sure actor-targeted shots have a valid actor selected.
6. Keep each shot note specific and camera-oriented.

### Generate Preview Shots

1. Click **Generate**.
2. Wait while each shot card moves through queued/generating/done states.
3. Inspect errors on any failed card.
4. Click inspect on a finished shot to view it larger.
5. Click regenerate on a single shot if only one angle failed.
6. Select the previews you want to keep.

### Render Selected Shots at 4K

1. Select one or more finished previews.
2. Click **Render 4K**.
3. Wait for final render processing.
4. Confirm selected cards show 4K-ready status.
5. Download 4K from the card or inspect view.
6. Use the stage promotion control if you want a shot variant to become the active Stage scene.

### Export Shot Packs for Handoff

1. Connect a save folder in **Settings** before exporting.
2. Build a staged scene and create one or more shots from STAGING or SHOTS.
3. Add shot names and notes so downstream collaborators understand the intent.
4. Keep reference slots, actor choices, annotations, and directed shot card notes up to date before export.
5. To export one active shot, use the shot pack export control when it is available.
6. To export every shot, open the shot list and click **Export All Packs**.
7. Wait for the export log to confirm the `ShotPacks` folder path.
8. Each exported shot pack may include:
   - manifest JSON.
   - compiled prompt text.
   - director settings.
   - reference slot metadata.
   - staged token data.
   - annotations and notes.
   - available preview, final, source, or blueprint images.
9. Use the compiled prompt for audit, rerun, or handoff review.
10. If an export looks incomplete, save the session, refresh the shot data, confirm the save folder is connected, and export again.

### Save or Reset a SHOTS Session

1. Download selected previews or finals before resetting.
2. Use **Reset Session** when you want to discard the current shot pack.
3. Reconfigure pack/count/locks.
4. Generate a new pack.

---

## 12. STORYBOARD [EXPERIMENTAL]

**Purpose:** Experimental Veo prompt, keyframe, monitor, and timeline workflow.

> **Experimental Note:** Storyboard is an Experimental feature. It is best used for early-access creative exploration, prompt development, keyframe planning, and selective workflows. Behavior, consistency, and available controls may continue to change.

### Enable Storyboard

1. Open **Settings**.
2. Toggle **Enable Storyboard (Veo 3.1)**.
3. Click **Save Config**.
4. Confirm **STORYBOARD** appears in the main tab bar.

### Prepare a Shot for Storyboard

1. Open **STAGING**.
2. Build or load a scene.
3. Open **Shot List**.
4. Click **New Shot**.
5. Capture **Start** and **End** frames if needed.
6. Click the clapperboard button to open Storyboard.
7. Confirm the shot appears in the Storyboard shot rail.

### Use the Storyboard Shot Rail

1. Open **STORYBOARD**.
2. Select a shot from the left rail.
3. Click **Create First Shot** if no shots exist.
4. Use delete on a shot only if you no longer need it.
5. Use **Clear all shots** only after confirming the entire storyboard can be reset.

### Use the Program Monitor

1. Select a shot.
2. Choose the active plate: start or end.
3. Drop or upload an image into the plate slot if the shot has no image.
4. Use **Load as Target** when you want the plate loaded for Storyboard generation.
5. Use **Set as Scene Anchor** to send the plate back into STAGING as the Scene Generator anchor.
6. Return to STAGING to build from that anchor image.

### Build a Veo Prompt

1. Select **Prompt** in STORYBOARD.
2. Enter the shot concept.
3. Fill cinematography details.
4. Choose shot type, lens, and camera motion.
5. Describe subject, action, context, and style/ambiance.
6. Add a **Negative Prompt** for things to avoid.
7. Add **Audio Prompts** if needed:
   - dialogue
   - sound effects
   - ambience
   - music
8. Click enhance/smart drafting if available.
9. Click **Copy** to copy the formatted five-part prompt.
10. Click **Neg** to copy only the negative prompt.
11. Click **Save** to store the draft on the active shot.

### Use the Keyframe Engine

1. Select **Keyframes**.
2. Upload or load a **Start Plate**.
3. Upload or load an **End Plate** if you need a transition.
4. If an active shot has frames, click **Load** to pull them in.
5. Click **Load & Sync** to load frames and run analysis.
6. Adjust **Advanced DNA Controls**:
   - Character Adherence
   - Continuity Lock
   - No Extra Objects
   - No Morphing
7. Click **Smart Analyze**.
8. Review the raw JSON spec.
9. Copy the spec if needed.
10. Click reset only after saving or copying anything important.

### Use the Timeline

1. Select **Timeline**.
2. Add timestamp beats.
3. Write the action or camera state for each beat.
4. Remove beats that are no longer needed.
5. Click **Copy Sequence** to copy formatted timeline text.
6. Click **Save to Shot** to store the timeline on the active shot.

### Use the Compiled Output Dock

1. Open the bottom compiled output dock.
2. Review the generated prompt or timeline sequence.
3. Click **Copy** to place the output on the clipboard.
4. Expand the negative traits section when present.
5. Copy the negative prompt separately if needed.

---

## 13. REGION EDIT / POST-PRODUCTION

**Purpose:** Correct localized parts of a generated result without rerendering the full image.

### Prepare for Region Edit

1. Generate or load a result in STAGING.
2. Open **Region Edit**.
3. Confirm the result image is visible.
4. Decide which area needs correction.

### Paint a Mask

1. Click **Mask ON**.
2. Choose a layer: **A**, **B**, or **C**.
3. Choose paint mode.
4. Adjust **Brush Size**.
5. Adjust edge softness if available.
6. Paint white over the exact area to edit.
7. Switch to erase mode if you need to remove part of the mask.
8. Click **Clear Active Mask** if the current layer should be reset.

### Use Multiple Edit Layers

1. Put each distinct fix on its own layer.
2. Enable only the layers you want to apply.
3. Use layer A for the first fix, B for the second, and C for the third.
4. Write separate instructions for each enabled layer.
5. Apply layers sequentially when the order matters.

### Protect Face, Hair, or Anatomy

1. Toggle **Protect Anatomy**.
2. Click **Generate** to create a protection mask.
3. Review the protection mask preview.
4. Adjust **Shrink Mask** if the protected area is too broad.
5. Leave protection enabled when editing near faces, hair, hands, or other identity-critical anatomy.
6. Clear the protection mask if it no longer matches the image.

### Write Layer Instructions

1. Select the active layer.
2. Write a precise instruction in **Layer Instruction**.
3. Use quick templates when helpful:
   - **Remove** for deleting an unwanted object.
   - **Replace** for replacing the masked area with a described object.
   - **Relight** for lighting correction.
4. Include texture, perspective, lighting, and realism notes.
5. Avoid broad instructions that affect the whole image.

### Apply or Cancel Region Edit

1. Confirm the correct layers are enabled.
2. Click **Apply Enabled Layers**.
3. Wait for the running layer to finish.
4. Click **Cancel** if you need to stop after the current layer.
5. Review the edited result.
6. Save or download the result if it is final.

---

## 14. Recommended Studio Pipelines

### Full Character-to-Scene Pipeline

1. Use **CAST**, **PORTRAIT**, or **NANO CAST** to create the actor.
2. Save the actor to the Actor Library.
3. Use **WARDROBE** to design and fit clothing.
4. Save the fitted actor.
5. Use **PROPS** to create or apply props.
6. Open **STAGING**.
7. Add background, actors, props, references, and director notes.
8. Generate a composite.
9. Use **SHOTS** for camera coverage.
10. Use **REGION EDIT** for local cleanup.
11. Save the final outputs.

### Identity-Preservation Pipeline

1. Start in **NANO CAST** with center/left/right references.
2. Keep identity lock high.
3. Generate a character.
4. Generate a reference sheet.
5. Save both actor and reference sheet.
6. Use the reference sheet as an identity anchor in **WARDROBE** and **STAGING**.
7. Use **Reference Stacks** for replacement or scene consistency.

### Fast Concept Pipeline

1. Start in **CAST**.
2. Generate a character quickly.
3. Add to Cast.
4. Open **STAGING**.
5. Generate a simple background.
6. Drag the actor onto the stage.
7. Enter a short Scene Director action.
8. Generate a composite.
9. Save only the outputs worth keeping.

### Storyboard Pipeline

1. Create a staged scene in **STAGING**.
2. Generate a composite.
3. Add a shot in **Shot List**.
4. Open **STORYBOARD**.
5. Build the Veo prompt.
6. Load start/end plates.
7. Smart Analyze.
8. Build a timestamp sequence.
9. Copy prompt outputs for video generation.
10. Use **Set as Scene Anchor** to route a Storyboard frame back into STAGING when needed.

---

## 15. Troubleshooting

| Issue | What to Do |
| :--- | :--- |
| Save folder says not linked | Open Settings, choose Render Save Folder again, then save config. |
| Library item is missing after save | Click Scan/Refresh in that library. Confirm the save folder is connected. |
| Hosted/BYOK confusion | Check the top-right mode display, then review Settings. Hosted uses account credits. BYOK uses your API key. |
| Hosted sign-in missing or expired | Open Settings and sign in again with the hosted account. |
| BYOK generation fails | Open Settings and confirm the Gemini API key is present. |
| Generated result disappeared | It was likely never saved to a durable library. Use Recent Generations if available, then export it to a library. |
| Actor name looks generic on disk | The PNG may use a generic safe filename. Check the JSON sidecar for the real metadata. |
| Wardrobe Try-On identity drifts | Use a saved actor with a strong reference image and upload a Character Sheet identity anchor. |
| Turnaround has inconsistent sides | Regenerate with a clearer costume reference and Character Sheet anchor. |
| Prop attaches to the wrong place | Add clearer placement notes, such as body part, side, scale, and orientation. |
| Stage actor height relationship is wrong | Put both actors on the same floor plane, write the height relationship plainly, and add an annotation guide if needed. |
| Pitch sheet callouts point to the wrong thing | Add clearer visible garment/material/prop notes, then regenerate the sheet. Omit unclear props rather than forcing vague labels. |
| Reference preview missing after reopening | Reconnect the same save folder and reload the session; re-upload only if the saved reference file is gone. |
| Replace Anchor Subjects swaps identities | Use Reference Stacks with clear target names and actor mapping. |
| SHOTS Generate is disabled | Create or choose a result source first by generating a composite or setting an uploaded source. |
| SHOTS actor shot fails preflight | Select the required actor in the Directed Shot Plan. |
| Shot pack export is missing notes or references | Save the shot, confirm reference slots and annotations are current, then export the pack again. |
| Storyboard tab missing | Enable Storyboard in Settings and save config. |
| Storyboard monitor shows no plate | Select a shot or upload a Start/End plate. |
| Region Edit changes too much | Use a tighter mask, enable Protect Anatomy, and make the instruction more local. |
| Region Edit does nothing | Confirm Mask ON, an enabled layer, a visible mask, and a non-empty layer instruction. |
| App feels stuck during generation | Check the footer status. Some hosted or 4K jobs take longer. |
| Need to preserve current work | Use File > Save Session or Save Session As before clearing or opening another session. |

---

## Final Note

Cast Director Studio is flexible. You can follow the full pipeline from actor identity to final shot pack, or you can use a single workspace for one focused task. The important habit is simple: save anything you want to reuse before clearing, switching sessions, or treating a temporary preview as permanent.

# Staging Scene Generator Prompt Redesign Spec

## Status
- Proposed for staging
- Owner: Product + Frontend
- Target surface: `AnchorRefPanel` in Staging (`src/renderer/components/panels/AnchorRefPanel.tsx`)

## Problem
The current Scene Generator prompt field is a single-line input with limited writing space. Users can add richer details, but the UI does not encourage longer prompts. This reduces prompt quality and generation quality.

## Goal
- Increase average prompt detail without slowing down quick-use workflows.
- Keep generation one click away.
- Add room for advanced users to write structured, long-form prompts.

## Non-Goals
- No backend model or prompt compiler refactor in this phase.
- No change to existing generation permission checks or billing logic.
- No redesign of the entire left sidebar.

## Recommendation
Ship a hybrid flow:
- Keep an inline editor for speed.
- Add auto-grow and manual resize to reduce cramped typing.
- Add a full-screen "Prompt Studio" modal for high-detail prompts.

This gives quick users minimal friction and power users maximum space.

## Current Technical Context
- Source of truth prompt state is `bgPrompt` in `SceneCanvas.tsx`.
- Generate action is `generateBg()`.
- Current field is an `<input>` in `AnchorRefPanel.tsx` with placeholder:
  - `Optional lighting, mood, or scene notes...`

## Proposed UX

### 1) Inline Prompt Field (Default)
- Replace current `<input>` with `<textarea>` (or reuse `AutoGrowTextarea`).
- Behavior:
  - Starts at 2 rows.
  - Auto-grows up to 8 rows.
  - After 8 rows, editor scrolls internally.
  - Manual vertical resize allowed (`resize-y`).
- Keep generate button to the right in compact mode.
- Add helper text below field:
  - `More detail usually improves scene quality.`

### 2) Expand Control
- Add an expand icon button on the prompt row.
- Tooltip:
  - `Open Prompt Studio`
- Click opens full-screen modal with same prompt text.

### 3) Prompt Studio Modal
- Full-screen overlay with large textarea and optional guidance chips.
- Title:
  - `Prompt Studio`
- Subtitle:
  - `Write detailed scene direction for better composition and lighting results.`
- Sections (single textarea plus optional insert chips):
  - Subject and action
  - Environment and time of day
  - Lighting and mood
  - Camera and composition
  - Style constraints
- Primary CTA:
  - `Apply to Scene Generator`
- Secondary CTA:
  - `Cancel`
- Keep generate action outside modal for now (phase 1), or optionally add:
  - `Apply and Generate`

### 4) Keyboard Behavior
- Inline:
  - `Enter` inserts newline.
  - `Ctrl+Enter` (Windows) or `Cmd+Enter` (macOS) triggers `generateBg()`.
- Modal:
  - Same shortcut behavior.
  - `Esc` closes modal without clearing text.

### 5) Prompt Persistence
- Keep using `bgPrompt` as source of truth.
- Add local UI persistence only:
  - last inline editor height
  - whether user last used expanded mode
- Storage keys:
  - `nb_staging_prompt_height`
  - `nb_staging_prompt_studio_last_open`

## UX Copy Spec
- Placeholder (inline and modal):
  - `Describe the scene, mood, lighting, camera angle, and key actions...`
- Inline helper:
  - `Tip: Specific details improve consistency and cinematic quality.`
- Empty-state suggestion chips:
  - `Add lighting`
  - `Add camera angle`
  - `Add mood`
  - `Add action`
  - `Add environment detail`

## Interaction States
- Idle
- Typing
- Expanded inline
- Prompt Studio open
- Generating (`state.isProcessing === true`)
- Disabled generate (`!bgPrompt.trim()` and no `state.backgroundUrl`)

## Accessibility Requirements
- All icon-only buttons need `aria-label`.
- Modal traps focus.
- `Esc` closes modal.
- Maintain visible focus ring on textarea and buttons.
- Minimum touch target size 36px for expand and generate icons.

## Telemetry (Staging Validation)
- `staging_prompt_focus`
- `staging_prompt_expand_clicked`
- `staging_prompt_modal_opened`
- `staging_prompt_modal_applied`
- `staging_generate_clicked`
- `staging_generate_with_prompt_length`
- `staging_generate_success`

Include prompt length bucket in telemetry payload:
- `0`
- `1-80`
- `81-200`
- `201-500`
- `500+`

## Success Metrics
- Increase median prompt length by at least 30% in staging.
- Increase share of prompts over 120 characters.
- No drop in generation completion rate.
- No increase in failed generations tied to malformed prompt formatting.

## Implementation Plan

### Phase 1 (Recommended for immediate staging)
- Replace input with auto-grow textarea.
- Add resize handle support.
- Add expand button and full-screen Prompt Studio modal.
- Add keyboard shortcuts and telemetry.

### Phase 2 (Optional)
- Add chip-based prompt scaffolding.
- Add "Apply and Generate" in modal.
- Add lightweight structured template insertion.

## Engineering Notes
- Primary files:
  - `src/renderer/components/panels/AnchorRefPanel.tsx`
  - `src/renderer/components/SceneCanvas.tsx`
  - Optional reusable modal in `src/renderer/components/ui/`
- Keep prompt state lifted in `SceneCanvas` to avoid sync bugs.
- Do not duplicate prompt state in modal; pass value and setter through props.

## QA Acceptance Criteria
- User can type at least 500 characters comfortably.
- Inline field grows automatically and can be manually resized.
- Prompt text remains intact when opening and closing modal.
- `Ctrl+Enter` / `Cmd+Enter` generates from both inline and modal.
- Generate button disable logic remains unchanged from current behavior.
- Existing style transfer and merge strategy controls are unaffected.

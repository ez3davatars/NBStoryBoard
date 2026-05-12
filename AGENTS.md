# Cast Director Studio — Codex Instructions

## Product Rule: Character Sheet Style Consistency

When modifying character sheet generation, always preserve a single unified visual style across the full sheet.

The source style is authoritative. Every generated panel must inherit the same style family, shading model, material response, lighting logic, texture language, edge treatment, anatomy language, and detail density.

Never allow a sheet to mix:
- cinematic realism with cartoon
- stylized 3D with flat illustration
- painterly panels with CGI panels
- anime panels with realistic panels
- simplified concept-art turnarounds with rendered hero figures

All panel generators must consume the same `style_lock` or equivalent shared style object.

If style mismatch detection exists, regenerate only the mismatched panels and preserve character identity, likeness, wardrobe, proportions, and pose requirements.

Do not fix style drift by changing the character.

## Required Negative Prompt for Sheet Panels

Append this style-consistency negative prompt to every panel generation request:

"No mixed styles. No realism mixed with cartoon. No stylized 3D mixed with flat illustration. No rendering-mode drift between panels. No inconsistent shading model, texture language, lighting logic, line-work, anatomy language, or material finish."

## Development Expectations

- Search the existing codebase before adding new systems.
- Prefer small, focused changes.
- Preserve existing public API behavior unless a new optional parameter is clearly needed.
- Add or update tests when changing prompt construction, sheet generation, validation, or export behavior.
- After changes, report which files changed and which tests were run.

# Universal Biometric Identity Lock

When working on Cast Director Studio, biometric identity preservation is the highest-priority rule for every character, not just one specific character.

Whenever a user uploads biometric identity references, those references become the absolute source of truth for that character’s identity.

This applies to all characters, including:
- real human actors
- digital doubles
- stylized avatars
- animated feature characters
- cinematic realism characters
- fantasy, sci-fi, historical, commercial, or editorial characters
- any future character type added to the system

## Identity Source of Truth

Uploaded biometric reference images override:
- generated source character images
- style presets
- costume presets
- board presentation styles
- prompt improvements
- regeneration passes
- layout changes
- pose changes
- annotation changes
- final export polish

The generated character source image may define wardrobe, styling, body presentation, pose language, and visual design, but it must never replace or override the uploaded biometric identity.

## Priority Order

All generation systems must follow this order:

1. `identity_lock`
2. `style_lock`
3. `costume_lock`
4. pose / expression / action direction
5. board layout
6. labels / annotations
7. presentation polish

No lower-priority layer may weaken, replace, reinterpret, or omit a higher-priority layer.

## Required Identity Preservation

Every character generation, panel generation, regeneration, preview, validation, and export step must preserve the active character’s uploaded biometric identity, including available traits such as:

- face shape
- skull/head shape
- hairline or baldness pattern
- hairstyle
- brow structure
- eye shape
- eye spacing
- nose shape
- mouth shape
- cheek structure
- jawline
- chin
- ears
- skin tone
- age impression
- facial hair shape, color, placement, and density
- body build and proportions when available
- distinctive marks or asymmetries when visible in the references

Only preserve traits that are visible or inferable from the provided references. Do not invent identity traits.

## Required Identity Prompt

Every generation request for a character with biometric references must include:

"Use the uploaded biometric reference images as the absolute source of truth for this character’s identity. Preserve the same visible facial structure, head shape, hair or baldness pattern, brow, eyes, nose, mouth, jawline, cheeks, ears, skin tone, age impression, facial hair if present, body build if visible, and distinctive identity traits across every panel. The render style may change only the artistic treatment, not the identity."

## Required Negative Prompt

Every generation request for a character with biometric references must include:

"No identity drift. No face redesign. No altered head or skull shape. No changed hairline, baldness pattern, hairstyle, brow, eyes, nose, mouth, jawline, cheeks, chin, ears, skin tone, age impression, ethnicity, facial hair, body build, or distinctive identity traits. No beautification. No generic face. No stylized replacement face. No cartoon face replacing the biometric likeness. No younger version. No older version. No slimmer face. No wider face. No prompt update, style update, costume update, layout update, or regeneration pass may weaken biometric likeness."

## Required Architecture

All prompt builders, panel generators, refinement passes, regeneration passes, preview systems, validation systems, and final export systems must consume the same active `identity_lock` object whenever biometric references exist.

Suggested universal model:

```json
{
  "identity_lock": {
    "enabled": true,
    "scope": "character",
    "priority": "absolute",
    "source": "uploaded_biometric_reference_images",
    "character_id": "<active_character_id>",
    "reference_views": ["front", "left_profile", "right_profile", "up", "down"],
    "preserve_visible_traits": true,
    "strictness": "maximum",
    "allow_identity_drift": false,
    "allow_beautification": false,
    "allow_face_redesign": false,
    "allow_age_change": false,
    "allow_ethnicity_change": false,
    "allow_genericization": false
  }
}

## Locked Regeneration Rule

Regeneration is not new character creation.

Any button or function labeled Regenerate, Retry, Improve, Fix, Refine, Rebuild Panel, Rebuild Sheet, or similar must preserve the active character locks.

Required preservation:
1. `identity_lock`
2. `body_lock`
3. `style_lock`
4. `costume_lock`
5. `character_id`
6. biometric reference IDs
7. approved source image IDs

Regeneration may only change the targeted failure:
- artifacts
- quality
- layout
- style consistency
- wardrobe consistency
- body correction
- pose correction

It must not create a new person, new face, new body type, new age, new ethnicity, new wardrobe, or new render style unless that specific layer is explicitly selected for change.

Default regeneration target:
`quality_artifacts_only`

Required locked-regeneration prompt:
"This is a locked regeneration pass for an existing character, not a new character creation. Preserve the exact same character identity, biometric facial structure, head shape, age impression, body build, wardrobe, and style from the locked sources. Correct only the requested issue. Do not reinterpret, redesign, recast, beautify, caricature, or replace the character."

Required locked-regeneration negative prompt:
"No new character. No recasting. No identity drift. No partial likeness only. No generic similar face. No stylized replacement face. No altered head shape. No changed facial proportions. No changed eyes, nose, mouth, cheeks, chin, jawline, ears, skin tone, age impression, facial hair, body type, costume, or style. No randomization. No prompt reinterpretation. No character redesign."
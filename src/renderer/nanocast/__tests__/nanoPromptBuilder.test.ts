import { describe, expect, it } from "vitest";

import { buildNanoCastPrompt } from "../nanoPromptBuilder";
import { resolveNanoCastStyleIdentityEnforcementConfig, getFallbackNanoCastStyleConfig } from "../../../prompts/nanoCastStyleIdentityEnforcement";
import type { NanoActorBlueprint } from "../nanoTypes";

const buildBlueprint = (overrides: Partial<NanoActorBlueprint> = {}): NanoActorBlueprint => ({
  identityAnchor: {
    sourceImageId: "[IMAGE 1]",
    identityLock: 95,
    apparentAge: 42,
    genderMode: "masculine",
    biometricSummary: "front, left, right, up, and down scan views"
  },
  morphologyKey: "titan",
  styleKey: "premiumAnimated3D",
  bodyScope: "full",
  wardrobe: {
    outfitPrompt: "black polo shirt",
    hairPrompt: "",
    logoPlacement: "Center Chest",
    hasLogo: true
  },
  stylization: 50,
  ...overrides
});

describe("buildNanoCastPrompt", () => {
  it("builds the immutable Nano Cast identity foundation", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint());

    expect(prompt).toContain("NANO CAST IMMUTABLE IDENTITY CONTRACT");
    expect(prompt).toContain("GLOBAL CHARACTER INVARIANT CONTRACT");
    expect(prompt).toContain("Do not infer body mass from face/head/neck scans");
    expect(prompt).toContain("The scanned biometric subject is the only identity source");
    expect(prompt).toContain("Morphology controls BODY SILHOUETTE ONLY");
    expect(prompt).toContain("MORPHOLOGY MATRIX CONTRACT");
    expect(prompt).toContain("MORPHOLOGY BODY AUTHORITY MODEL");
    expect(prompt).toContain("SURFACE MARK FIDELITY CONTRACT");
    expect(prompt).toContain("Preserve skin tone, age impression, general complexion, and natural facial texture.");
    expect(prompt).toContain("NANOCAST STYLE-SPECIFIC IDENTITY ENFORCEMENT");
    expect(prompt).toContain("different person");
    expect(prompt).toContain("new actor");
    expect(prompt).toContain("face replacement");
    expect(prompt).toContain("generic style-template face");
  });

  it("keeps Titan strict and muscular without fat inference", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({ morphologyKey: "titan" }));

    expect(prompt).toContain("STRICT BODY ARCHETYPE: broad-shouldered, powerful, muscular adult frame");
    expect(prompt).toContain("Titan means muscular/broad, not fat");
    expect(prompt).not.toMatch(/subtly/i);
  });

  it("keeps Guardian sturdy without allowing obesity by default", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({ morphologyKey: "guardian" }));

    expect(prompt).toContain("STRICT BODY ARCHETYPE: sturdy solid adult frame");
    expect(prompt).toContain("Guardian means sturdy/solid; it must not become obese unless explicit user body text asks for it");
  });

  it("keeps Scout lean and bans face-based body mass inference", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({ morphologyKey: "scout" }));

    expect(prompt).toContain("STRICT BODY ARCHETYPE: lean athletic adult frame");
    expect(prompt).toContain("Scout must never produce overweight, heavy-set, bulky, or large-belly bodies");
    expect(prompt).toContain("Large neck, full cheeks, broad jaw, rounded chin, mature face weight, facial hair, and close camera crop are facial identity features only");
  });

  it("restricts Sprite for adult scans", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({ morphologyKey: "sprite" }));

    expect(prompt).toContain("STRICT BODY ARCHETYPE: small-frame stylized youth-proportion guide");
    expect(prompt).toContain("Never apply chibi, childlike, or oversized-head proportions to adult scans");
  });

  it("keeps style protocols separated", () => {
    const animated = buildNanoCastPrompt(buildBlueprint({ styleKey: "premiumAnimated3D" }));
    const realism = buildNanoCastPrompt(buildBlueprint({ styleKey: "premiumCGRealism" }));

    expect(animated).toContain("No photorealism");
    expect(animated).toContain("no live-action realism");
    expect(animated).toContain("no default cute animated face template");
    expect(animated).toContain("invented body marks");
    expect(realism).toContain("No Pixar style");
    expect(realism).toContain("no anime");
    expect(realism).toContain("no cartoon proportions");
  });

  it("keeps empty hair and outfit/logo layers scoped", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({
      wardrobe: {
        outfitPrompt: "navy blazer",
        hairPrompt: "",
        logoPlacement: "Left Chest",
        hasLogo: true
      }
    }));

    expect(prompt).toContain("Empty hair prompt: preserve source hairstyle");
    expect(prompt).toContain("outfitPrompt changes clothing only");
    expect(prompt).toContain("Logo placement affects clothing surface only");
  });

  it("includes anatomy integrity and repeatability rules", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint());

    expect(prompt).toContain("ANATOMY INTEGRITY");
    expect(prompt).toContain("Single coherent character");
    expect(prompt).toContain("REPEATABILITY REQUIREMENT");
    expect(prompt).toContain("same scanned person as other Nano Cast renders in this session");
  });

  it("uses scope-specific body language", () => {
    const full = buildNanoCastPrompt(buildBlueprint({ bodyScope: "full" }));
    const torso = buildNanoCastPrompt(buildBlueprint({ bodyScope: "torso" }));
    const head = buildNanoCastPrompt(buildBlueprint({ bodyScope: "head" }));

    expect(full).toContain("Full body scope requires coherent full body stance");
    expect(torso).toContain("Torso scope does not request full body");
    expect(head).toContain("Do not request body generation");
  });

  it("ignores default height and weight when Advanced body override is inactive", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({
      bodyOverride: {
        active: false,
        heightIn: 70,
        weightLbs: 170
      }
    }));

    expect(prompt).toContain("ADVANCED BODY OVERRIDE INACTIVE");
    expect(prompt).toContain("Ignore default height/weight slider values for body generation");
    expect(prompt).not.toContain("Target Mass: 170 lbs");
    expect(prompt).not.toContain("Target Height: 5'10\"");
  });

  it("includes edited height and weight only when Advanced body override is active", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({
      bodyOverride: {
        active: true,
        heightIn: 74,
        weightLbs: 212
      }
    }));

    expect(prompt).toContain("ADVANCED BODY OVERRIDE ACTIVE");
    expect(prompt).toContain("Target Height: 6'2\"");
    expect(prompt).toContain("Target Mass: 210 lbs");
    expect(prompt).toContain("Apply these user-edited body values to the full-body silhouette only");
  });

  it("uses maximum identity preservation above 90", () => {
    const prompt = buildNanoCastPrompt(buildBlueprint({
      identityAnchor: {
        sourceImageId: "[IMAGE 1]",
        identityLock: 95
      }
    }));

    expect(prompt).toContain("Identity lock is above 90, so use maximum identity preservation");
  });

  it("handles fallback configuration and generated character source correctly", () => {
    const unknownConfig = resolveNanoCastStyleIdentityEnforcementConfig("unknown_style_xyz");
    expect(unknownConfig).toBeUndefined();

    const fallbackConfig = getFallbackNanoCastStyleConfig();
    expect(fallbackConfig.label).toBe("Family 3D Animation");

    const prompt = buildNanoCastPrompt(buildBlueprint({
      generatedCharacterSourceIndex: 3,
      generatedCharacterSourceRole: "approved generated source"
    }));

    expect(prompt).toContain("GLOBAL CHARACTER INVARIANT CONTRACT");
    expect(prompt).toContain("Generated character source remains the approved visual/body/costume source when supplied.");
    expect(prompt).toContain("[IMAGE 3] controls body silhouette, outfit, costume, proportions, stance, and visual design. Biometric scans control face/head identity only.");
  });
});

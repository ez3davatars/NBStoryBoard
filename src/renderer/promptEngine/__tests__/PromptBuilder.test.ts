import { describe, it, expect } from 'vitest';
import { buildVeo31Prompt } from '../PromptBuilder';
import type { Veo31Spec } from '../types';

describe('PromptBuilder', () => {
    it('should generate a deterministic prompt with locked traits', () => {
        const spec: Veo31Spec = {
            character: {
                identity: "A pirate captain",
                wardrobe: "Red coat",
                emotionalState: "Happy",
                lockedTraits: ["Hook hand", "Eyepatch"]
            },
            style: {
                visualStyle: "Cinematic",
                lighting: "Golden Hour",
                colorPalette: "Warm",
                lensLanguage: "35mm"
            },
            environment: {
                setting: "Ship deck",
                props: ["Barrel", "Rope"],
                weatherTime: "Sunset",
                lockedElements: ["Mast position"]
            },
            motion: {
                cameraMovement: "Static",
                characterAction: "Laughing"
            },
            frame1Description: "A captain standing on deck.",
            frame2Description: "A captain laughing on deck."
        };

        const result = buildVeo31Prompt(spec);

        expect(result.prompt).toContain("VEO 3.1 DIRECTOR SPEC (STRICT):");
        expect(result.prompt).toContain("CHARACTER BIBLE:");
        expect(result.prompt).toContain("- Identity: A pirate captain");
        expect(result.prompt).toContain("- Wardrobe: Red coat");
        expect(result.prompt).toContain("- Locked Traits: Hook hand, Eyepatch");
        expect(result.prompt).toContain("ENVIRONMENT BIBLE:");
        expect(result.prompt).toContain("- Locked Elements: Mast position");
        expect(result.prompt).toContain("STYLE BIBLE:");
        expect(result.prompt).toContain("MOTION DELTA:");
        expect(result.prompt).toContain("OUTPUT: Generate a coherent video that matches the bibles above.");
        expect(result.prompt).toContain("CRITICAL INSTRUCTION: If DIRECTOR'S MANUAL OVERRIDES are present");

        // Assert Negatives
        expect(result.negatives).toContain("cartoon"); // Because style is Cinematic
        expect(result.negatives).toContain("morphing");
    });
});

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

        console.log(result.prompt); // Inspect manually if needed

        expect(result.prompt).toContain("**1. SHARED VISUAL DNA (LOCKED):**");
        expect(result.prompt).toContain("**Identity:** A pirate captain. Red coat.");
        expect(result.prompt).toContain("**Locked Traits:** Hook hand, Eyepatch.");
        expect(result.prompt).toContain("**Locked Elements:** Mast position.");
        expect(result.prompt).toContain("[VEO 3.1 TEMPORAL INTERPOLATION]");
        expect(result.prompt).toContain("GENERATE VEO VIDEO.");
        
        // Assert Negatives
        expect(result.negatives).toContain("cartoon"); // Because style is Cinematic
        expect(result.negatives).toContain("morphing");
    });
});

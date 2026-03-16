// Director Canvas Blocking Templates (V34.1)
// These templates provide lightweight advisory positional notes and blueprint marks.
// They are explicitly non-destructive and cannot auto-layout the entire scene.

export interface BlockingTemplate {
    id: string;
    name: string;
    description: string;
    category: 'actorPose' | 'cinematicComposition';
    placementHints?: Partial<Record<'x' | 'y' | 'anchorX' | 'anchorY', number>>;
    notes?: string;
    defaultBlueprintMarks?: Array<{
        type: 'floorLine' | 'gazeArrow' | 'pathArrow';
        xOffset: number;
        yOffset: number;
        width: number;
        rotation: number;
    }>;
}

export const blockingTemplates: BlockingTemplate[] = [
    // --- ACTOR POSES ---
    {
        id: 'pose-standing-neutral',
        name: 'Standing Neutral',
        description: 'Default standing posture with standard grounding.',
        category: 'actorPose',
        placementHints: { anchorX: 0.5, anchorY: 0.8 },
        notes: "Actor is standing in a neutral, relaxed posture.",
        defaultBlueprintMarks: [
            { type: 'floorLine', xOffset: 0, yOffset: 20, width: 60, rotation: 0 }
        ]
    },
    {
        id: 'pose-seated-center',
        name: 'Seated',
        description: 'Seat the actor near the current anchor point.',
        category: 'actorPose',
        placementHints: { anchorX: 0.5, anchorY: 0.8 },
        notes: "Actor is seated securely.",
    },
    {
        id: 'pose-leaning-left',
        name: 'Leaning Left',
        description: 'Leans the actor against a nearby structure on the left.',
        category: 'actorPose',
        notes: "Actor is leaning casually to their left side against the environment.",
    },
    {
        id: 'pose-walking-forward',
        name: 'Walking Forward',
        description: 'Adds an active forward-motion intent.',
        category: 'actorPose',
        notes: "Actor is mid-stride walking directly forward toward the camera.",
        defaultBlueprintMarks: [
            { type: 'pathArrow', xOffset: 0, yOffset: 40, width: 80, rotation: 90 }
        ]
    },

    // --- CINEMATIC COMPOSITION ---
    {
        id: 'comp-centered-hero',
        name: 'Centered Hero',
        description: 'Bold, dead-center framing.',
        category: 'cinematicComposition',
        notes: "Maintain a perfectly centered hero composition. Ensure the subject commands the absolute center of the frame.",
    },
    {
        id: 'comp-rule-thirds-left',
        name: 'Rule of Thirds (Left)',
        description: 'Aligns framing to the left vertical line.',
        category: 'cinematicComposition',
        notes: "Compose the primary subject along the negative left-third grid line. Leave the right side open for environmental context.",
    },
    {
        id: 'comp-rule-thirds-right',
        name: 'Rule of Thirds (Right)',
        description: 'Aligns framing to the right vertical line.',
        category: 'cinematicComposition',
        notes: "Compose the primary subject along the negative right-third grid line. Leave the left side open for environmental context.",
    },
    {
        id: 'comp-over-shoulder',
        name: 'Over The Shoulder',
        description: 'Forces a foreground-occluded OTS perspective.',
        category: 'cinematicComposition',
        notes: "Frame this as a tight Over-The-Shoulder (OTS) shot. A foreground element should partially occlude one side of the frame.",
    },
    {
        id: 'comp-foreground-occlusion',
        name: 'Foreground Occlusion',
        description: 'Uses depth or objects to mask the lower frame.',
        category: 'cinematicComposition',
        notes: "Emphasize foreground occlusion. Allow environmental elements to obscure the lower portion of the subject naturally.",
    }
];

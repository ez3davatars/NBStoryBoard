
export type CharacterDNA = {
    id: string;

    identity: {
        name?: string;
        sex: string;
        ethnicity: string;
        lifeStage: "child" | "teen" | "adult" | "elder";
        age: number;
        skinTone: string;
    };

    morphology: {
        heightCm: number;
        weightKg: number;
        bmi: number;
        buildDescription: string;
    };

    face: {
        faceShape?: string;
        eyes?: string;
        nose?: string;
        lips?: string;
        jaw?: string;
    };

    skin: {
        freckles: number;
        scars: number;
        dermalAge: number;
        surfaceUnderEyeControl?: boolean;
    };

    hair: {
        style?: string;
        color?: string;
        length?: string;
        texture?: string;
    };

    render: {
        lighting: string;
        camera: string;
        realismLevel: number;
        stylizationLevel: number;
        additionalNotes?: string;
    };

    // --- REFERENCE MODE FIELDS (V1.2) ---
    identityMode?: "synthetic" | "reference";
    referenceImageUrl?: string;
    refEditMode?: "enhance" | "override";
    allowRefMorphology?: boolean;
    allowRefHair?: boolean;
    allowRefFace?: boolean;
    allowRefSkin?: boolean;
    likenessLock?: number;
    variationId?: string;
    randomSeed?: number;
};

export const computeBMI = (heightCm: number, weightKg: number): number => {
    if (heightCm <= 0) return 0;
    const heightM = heightCm / 100;
    return Number((weightKg / (heightM * heightM)).toFixed(1));
};

export const deriveBuildDescription = (bmi: number): string => {
    if (bmi < 18.5) return "Underweight / Slender";
    if (bmi < 25) return "Average / Athletic";
    if (bmi < 30) return "Overweight / Heavy";
    return "Obese / Large Build";
};

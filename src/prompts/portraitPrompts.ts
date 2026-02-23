
// --- PRESET DEFINITIONS ---

export const LIGHTING_PRESETS = [
    // STUDIO FUNDAMENTALS
    { key: "studio_header", label: "── Studio Fundamentals ──", category: "Studio Fundamentals", description: "", prompt: "", disabled: true },
    { key: "Soft Studio Key (Centered)", label: "Soft Studio Key (Centered)", category: "Studio Fundamentals", description: "Soft studio key light, centered above camera, gentle butterfly shadow", prompt: "Soft studio key light, centered above camera, creating even illumination with gentle butterfly shadow under nose. Soft fill." },
    { key: "Soft Key Left", label: "Soft Key Left", category: "Studio Fundamentals", description: "Soft light from subject's right, gentle modeling", prompt: "Soft large light source from subject's right (camera left), creating gentle modeling and dimension. subtle fill on shadow side." },
    { key: "Soft Key Right", label: "Soft Key Right", category: "Studio Fundamentals", description: "Soft light from subject's left, gentle modeling", prompt: "Soft large light source from subject's left (camera right), creating gentle modeling and dimension. subtle fill on shadow side." },
    { key: "Clamshell (Beauty Light)", label: "Clamshell (Beauty Light)", category: "Studio Fundamentals", description: "Key light above, reflector below, glowing skin", prompt: "Clamshell beauty lighting setup. Key light above, reflector below. Eliminates shadows under eyes and chin. Glowing skin tone." },
    { key: "High Key Studio", label: "High Key Studio", category: "Studio Fundamentals", description: "Bright, airy, minimal shadows", prompt: "High key studio lighting. Bright, airy, minimal shadows. Evenly lit background. Optimistic and clean atmosphere." },
    { key: "Low Key Dramatic", label: "Low Key Dramatic", category: "Studio Fundamentals", description: "Shadow heavy, moody, mysterious", prompt: "Low key dramatic lighting. Mostly shadow, selective highlighting of face features. High contrast, moody, mysterious atmosphere." },
    { key: "Rembrandt Lighting", label: "Rembrandt Lighting", category: "Studio Fundamentals", description: "Triangle highlight on cheek, high contrast", prompt: "Classic Rembrandt lighting. Single directional key light creating a distinct illuminated triangle on the shadow side of the cheek. High artistic contrast." },
    { key: "Split Lighting", label: "Split Lighting", category: "Studio Fundamentals", description: "One side lit, one side shadow", prompt: "Split lighting setup. Key light at 90 degrees. One side of face fully lit, other side in shadow. High drama." },
    { key: "Butterfly Lighting", label: "Butterfly Lighting", category: "Studio Fundamentals", description: "High centered key, butterfly shadow under nose", prompt: "Butterfly lighting (Paramount lighting). Key light high and centered. distinctive butterfly-shaped shadow under the nose. Glamorous and sculpting." },

    // CINEMATIC
    { key: "cine_header", label: "── Cinematic ──", category: "Cinematic", description: "", prompt: "", disabled: true },
    { key: "Golden Hour Warm", label: "Golden Hour Warm", category: "Cinematic", description: "Warm horizontal sunlight, nostalgic", prompt: "Golden hour lighting. Warm, horizontal sunlight. Rich orange and gold tones. Rim lighting on hair. Atmospheric and nostalgic." },
    { key: "Overcast Natural", label: "Overcast Natural", category: "Cinematic", description: "Soft diffused sky light, mute colors", prompt: "Soft overcast natural light. Giant softbox effect from the sky. Diffused shadows, mute colors, realistic and raw texture." },
    { key: "Moody Side Key", label: "Moody Side Key", category: "Cinematic", description: "Film noir aesthetic, deep shadows", prompt: "Cinematic moody side light. Strong contrast between light and dark. Film noir aesthetic. Deep shadows." },
    { key: "Hard Rim Light", label: "Hard Rim Light", category: "Cinematic", description: "Strong backlight, silhouette outline", prompt: "Strong backlighting (Rim light). Silhouette outline. Subject's face in shadow or gently filled. Separation from background." },
    { key: "Backlit Silhouette", label: "Backlit Silhouette", category: "Cinematic", description: "Light behind subject, glowing hair", prompt: "Backlit silhouette. Light source directly behind subject. detailed hair strands glowing. Face in deep shadow/profile." },

    // COMMERCIAL
    { key: "comm_header", label: "── Commercial ──", category: "Commercial", description: "", prompt: "", disabled: true },
    { key: "Corporate Headshot Neutral", label: "Corporate Headshot Neutral", category: "Commercial", description: "Clean, even, trustworthy, neutral", prompt: "Professional corporate headshot lighting. Clean, uneven, trustworthy. Neutral color temperature. No artistic shadows." },
    { key: "Magazine Editorial Soft", label: "Magazine Editorial Soft", category: "Commercial", description: "Large soft source, painterly, low contrast", prompt: "Magazine editorial lighting. Very large soft light source. Low contrast, painterly quality. Flattering skin texture." },
    { key: "Fashion High Contrast", label: "Fashion High Contrast", category: "Commercial", description: "Hard light, beauty dish, punchy colors", prompt: "High fashion lighting. Harder light source (Beauty Dish). Defined shadows, glossy highlights, high contrast and punchy colors." },
    { key: "Product Catalog Clean", label: "Product Catalog Clean", category: "Commercial", description: "Shadowless, clinical, accurate color", prompt: "Clean product catalog lighting. Perfectly even, shadowless, accurate color reproduction. Clinical and crisp." }
];

export const CAMERA_PRESETS = [
    // PORTRAIT STANDARD
    { key: "portrait_header", label: "── Portrait Standard ──", category: "Portrait Standard", description: "", prompt: "", disabled: true },
    { key: "50mm Standard Portrait", label: "50mm Standard Portrait", category: "Portrait Standard", description: "Natural eye perspective", prompt: "50mm lens. Natural field of connection. Mimics human eye perspective. Neutral compression." },
    { key: "85mm Classic Portrait", label: "85mm Classic Portrait", category: "Portrait Standard", description: "Flattering compression, slight bokeh", prompt: "85mm portrait lens. Flattering facial compression. Slight separation from background. The gold standard for portraits." },
    { key: "105mm Compression Portrait", label: "105mm Compression Portrait", category: "Portrait Standard", description: "Stronger compression, features flatter", prompt: "105mm telephoto lens. Stronger facial compression. Features look flatter and ears further back. Background isolated." },
    { key: "135mm Tight Portrait", label: "135mm Tight Portrait", category: "Portrait Standard", description: "High compression, tight focus", prompt: "135mm telephoto lens. High compression. Very tight framing focus, but ensure NO cropping of the head or hair. Background completely compressed/blurred." },

    // CINEMATIC
    { key: "cine_cam_header", label: "── Cinematic ──", category: "Cinematic", description: "", prompt: "", disabled: true },
    { key: "35mm Cinematic Portrait", label: "35mm Cinematic Portrait", category: "Cinematic", description: "Wider context, storytelling", prompt: "35mm cinematic lens. Slightly wider context. More environmental feel. Storytelling perspective." },
    { key: "28mm Environmental Portrait", label: "28mm Environmental Portrait", category: "Cinematic", description: "Wide angle, strong perspective", prompt: "28mm wide angle. Strong perspective distortion. Nose appears larger if too close. Includes more surrounding body/environment." },
    { key: "70mm Filmic Medium Shot", label: "70mm Filmic Medium Shot", category: "Cinematic", description: "Panavision aesthetic, balanced", prompt: "70mm film lens. Balanced cinematic look. Panavision aesthetic. Anamorphic bokeh characteristics." },

    // STYLIZED
    { key: "style_header", label: "── Stylized ──", category: "Stylized", description: "", prompt: "", disabled: true },
    { key: "Slight Telephoto Compression", label: "Slight Telephoto Compression", category: "Stylized", description: "Graphic 2D look, flattened", prompt: "Telephoto compression effect. Features flattened. Graphic 2D look. Minimal depth perception." },
    { key: "Neutral Perspective", label: "Neutral Perspective", category: "Stylized", description: "Clinical, mathematical precision", prompt: "Orthographic-like neutral perspective. Mathematical precision. No distortion. Clinical study look." },
    { key: "Subtle Wide Perspective", label: "Subtle Wide Perspective", category: "Stylized", description: "Dynamic, looming presence", prompt: "Subtle wide angle distortion. Dynamic feel. Looming presence. Slightly exaggerated features." }
];

export const FACE_SHAPE_PRESETS = [
    { key: "Oval", label: "Oval", prompt: "Oval face shape. Balanced proportions. Gently rounded hairline and jaw." },
    { key: "Round", label: "Round", prompt: "Round face shape. Full cheeks. Soft jawline. Width equals length." },
    { key: "Square", label: "Square", prompt: "Square face shape. Strong angular jaw. Wide forehead. Equal width at jaw and forehead." },
    { key: "Heart", label: "Heart", prompt: "Heart face shape. Wide forehead. High cheekbones. Tapered chin." },
    { key: "Diamond", label: "Diamond", prompt: "Diamond face shape. Narrow forehead and chin. Wide high cheekbones." },
    { key: "Long / Rectangular", label: "Long / Rectangular", prompt: "Rectangular face shape. Elongated silhouette. Strong jaw. High forehead." },
    { key: "Triangle", label: "Triangle", prompt: "Triangle face shape. Jawline wider than forehead. Angular chin." }
];

export const EYE_PRESETS = [
    { key: "Almond", label: "Almond", prompt: "Almond shaped eyes. Slightly pointed ends. Classic symmetry." },
    { key: "Round", label: "Round", prompt: "Round eyes. Visible white above or below iris. Open and alert look." },
    { key: "Hooded", label: "Hooded", prompt: "Hooded eyes. Skin fold obscures crease. Deep set appearance." },
    { key: "Deep-set", label: "Deep-set", prompt: "Deep-set eyes. Recessed into skull. Prominent brow bone." },
    { key: "Wide-set", label: "Wide-set", prompt: "Wide-set eyes. Greater distance between eyes than eye width." },
    { key: "Close-set", label: "Close-set", prompt: "Close-set eyes. Distance between eyes less than eye width." },
    { key: "Monolid", label: "Monolid", prompt: "Monolid eyes. No visible crease. Smooth eyelid surface." }
];

export const NOSE_PRESETS = [
    { key: "Straight", label: "Straight", prompt: "Straight nose. Linear bridge. No bumps or depressions." },
    { key: "Aquiline", label: "Aquiline", prompt: "Aquiline nose. Convex bridge (hooked). Prominent profile." },
    { key: "Button", label: "Button", prompt: "Button nose. Small, short, and slightly turned up tip." },
    { key: "Broad", label: "Broad", prompt: "Broad nose. Wide bridge and flared nostrils. Strong feature." },
    { key: "Narrow", label: "Narrow", prompt: "Narrow nose. Thin bridge. Refined nostrils." },
    { key: "Upturned", label: "Upturned", prompt: "Upturned nose. Tip angled upwards. Nostrils visible." },
    { key: "Downturned", label: "Downturned", prompt: "Downturned nose. Tip angles downwards. Septum visible." }
];

export const LIP_PRESETS = [
    { key: "Thin", label: "Thin", prompt: "Thin lips. Low volume. Crisp definition." },
    { key: "Medium", label: "Medium", prompt: "Medium lips. Balanced volume. Natural definition." },
    { key: "Full", label: "Full", prompt: "Full lips. High volume. Plump and prominent." },
    { key: "Wide", label: "Wide", prompt: "Wide mouth. Corners extend towards cheeks." },
    { key: "Defined Cupid's Bow", label: "Defined Cupid's Bow", prompt: "Defined Cupid's bow. Sharp peaks on upper lip center." }
];

export const JAW_PRESETS = [
    { key: "Soft", label: "Soft", prompt: "Soft jawline. Gentle curve. Minimal definition." },
    { key: "Strong", label: "Strong", prompt: "Strong jawline. Prominent bone structure. Defined masseters." },
    { key: "Angular", label: "Angular", prompt: "Angular jawline. Sharp corners. Distinct definition." },
    { key: "Rounded", label: "Rounded", prompt: "Rounded jawline. Smooth continuous curve." },
    { key: "Tapered", label: "Tapered", prompt: "Tapered jawline. Narrows significantly from ears to chin." }
];

import type { CharacterDNA } from "../types/characterDNA";

export const VARIATION_LIBRARY: Record<string, { name: string; overrides: string }> = {
    "A1": {
        name: "A1 — Neutral Studio Standard (Baseline)",
        overrides: "- Expression: neutral, relaxed, closed mouth, calm eyes.\n- Lighting: Soft Studio Key (Centered), balanced fill, subtle rim.\n- Lens: 85mm classic portrait look.\n- Contrast: medium, clean exposure."
    },
    "A2": {
        name: "A2 — Corporate Headshot Neutral",
        overrides: "- Expression: confident neutral, slight “engaged” eyes (no smile).\n- Lighting: soft key 15° above eye-line + gentle fill, minimal shadow.\n- Lens: 85mm classic portrait look.\n- Background: neutral seamless slightly brighter than subject."
    },
    "A3": {
        name: "A3 — High Key Catalog Clean",
        overrides: "- Expression: neutral, approachable.\n- Lighting: High Key Studio, very even lighting, minimal shadow.\n- Lens: 70mm–85mm portrait look.\n- Background: bright seamless (not pure white blowout)."
    },
    "B1": {
        name: "B1 — Friendly Micro‑Smile",
        overrides: "- Expression: subtle friendly micro‑smile (closed mouth), relaxed cheeks.\n- Lighting: Clamshell / Beauty Light (soft key above + soft fill below).\n- Lens: 85mm classic portrait look.\n- Skin: natural, no beauty retouching."
    },
    "B2": {
        name: "B2 — Warm Approachability",
        overrides: "- Expression: slight smile with relaxed eyes (still closed mouth).\n- Lighting: Soft Key Left + fill, warm neutral color temp.\n- Lens: 85mm classic portrait look.\n- Background: warm‑leaning seamless gradient."
    },
    "C1": {
        name: "C1 — Rembrandt Classic",
        overrides: "- Expression: neutral to serious.\n- Lighting: Rembrandt Lighting (directional soft key camera-left), controlled shadows, subtle rim.\n- Lens: 85mm classic portrait look.\n- Contrast: medium-high but not harsh."
    },
    "C2": {
        name: "C2 — Low Key Dramatic",
        overrides: "- Expression: serious, calm.\n- Lighting: Low Key Studio, soft key from one side + minimal fill, soft rim.\n- Lens: 85mm–105mm portrait look.\n- Background: darker seamless gradient."
    },
    "C3": {
        name: "C3 — Split Lighting (Noir‑ish but studio)",
        overrides: "- Expression: serious, composed.\n- Lighting: Split Lighting (key from exact side), one side lit, one side in shadow, controlled fill.\n- Lens: 85mm classic portrait look.\n- Background: dark seamless."
    },
    "D1": {
        name: "D1 — Editorial Soft",
        overrides: "- Expression: neutral, “editorial calm”.\n- Lighting: Magazine Editorial Soft (large soft key + gentle rim).\n- Lens: 105mm compression portrait look.\n- Background: subtle gradient, slightly warm."
    },
    "D2": {
        name: "D2 — Butterfly Lighting (Classic Beauty)",
        overrides: "- Expression: neutral, calm.\n- Lighting: Butterfly Lighting (key high center), small shadow under nose, controlled fill.\n- Lens: 85mm classic portrait look.\n- Skin: natural texture preserved."
    },
    "E1": {
        name: "E1 — 50mm Standard Portrait (slightly wider)",
        overrides: "- Expression: neutral.\n- Lighting: Soft Studio Key (Centered).\n- Lens: 50mm standard portrait look (slightly wider perspective).\n- Framing: chest‑up, keep face geometry consistent."
    },
    "E2": {
        name: "E2 — 135mm Tight Portrait (compression)",
        overrides: "- Expression: neutral.\n- Lighting: Soft Studio Key (Centered) + rim.\n- Lens: 135mm tight portrait look (compression, flattering).\n- Framing: slightly tighter chest‑up (no crop of chin/top of head)."
    },
    "F1": {
        name: "F1 — Cool Clean (Overcast Studio)",
        overrides: "- Expression: neutral.\n- Lighting: Soft diffused cool daylight feel, even exposure.\n- Lens: 85mm classic portrait look.\n- Color: cool-neutral grade (no neon)."
    },
    "F2": {
        name: "F2 — Warm Golden Studio",
        overrides: "- Expression: neutral to slight micro‑smile.\n- Lighting: warm studio key + subtle rim, gentle golden tone (not outdoor scene).\n- Lens: 85mm classic portrait look.\n- Background: warm gradient."
    },
    "F3": {
        name: "F3 — Rim‑Accented Silhouette Edge (still frontal)",
        overrides: "- Expression: neutral.\n- Lighting: soft key + stronger rim light outlining hair/shoulders, face still fully readable.\n- Lens: 85mm classic portrait look.\n- Background: darker gradient."
    }
};

export const VARIATION_PACKS: Record<string, string[]> = {
    "Studio": ["A1", "A2", "A3"],
    "Commercial": ["B1", "B2"],
    "Dramatic": ["C1", "C2", "C3"],
    "Editorial": ["D1", "D2"],
    "Lens": ["E1", "E2"],
    "Color": ["F1", "F3"]
};


export function buildPortraitPrompt(dna: CharacterDNA): string {
    const parts: string[] = [];

    // --- STYLIZATION SAFETY (REFERENCE MODE) ---
    let stylizationLevel = dna.render.stylizationLevel;
    let realismLevel = dna.render.realismLevel;

    if (dna.identityMode === "reference" && (dna.likenessLock || 100) >= 90) {
        stylizationLevel = Math.min(stylizationLevel, 20);
        realismLevel = Math.max(realismLevel, 70);
    }

    // --- REFERENCE MODE HEADERS (STRICT IDENTITY LOCK) ---
    // --- REFERENCE MODE VARIATION WRAPPER (MAX PACK) ---
    if (dna.identityMode === "reference" && dna.variationId) {
        const variation = VARIATION_LIBRARY[dna.variationId];
        if (variation) {
            const safetyLine = (dna.identity.lifeStage === "child" || dna.identity.lifeStage === "teen")
                ? "\n- SAFETY MUST-FOLLOW: This subject is under 18. Keep all clothing and expressions strictly age-appropriate and modest."
                : "";

            return `REFERENCE MODE VARIATION: [${variation.name}]

Purpose:
- Generate a high-fidelity variation of the reference subject while maintaining absolute identity lock.

Variation Specific Overrides:
${variation.overrides}

Non-Negotiable Constraints:
- Full frontal pose and orientation. No head tilts or 3/4 angles.
- Preserve exact facial geometry, skull shape, and spacing of features from reference.
- Framing: WIDE chest-up studio portrait. Zoom out slightly. Pull the camera back to ensure significant headroom above the highest point of the hair/head. 
- Clothing: Plain black t-shirt only (unless preserving reference wardrobe).
- No NEW accessories beyond the reference image. Do not remove existing eyewear/accessories.
- Background: Neutral studio seamless background.
- Output: ONE image only.${safetyLine}`;
        }
    }

    if (dna.identityMode === "reference") {
        const lockValue = dna.likenessLock || 100;
        const refEditMode = dna.refEditMode || "enhance";
        const allowHair = dna.allowRefHair !== false;
        const allowFace = dna.allowRefFace !== false;
        const allowSkin = dna.allowRefSkin !== false;
        const allowMorphology = dna.allowRefMorphology !== false;
        const dermalAge = dna.skin.dermalAge;
        const surfaceUnderEyeControl = dna.skin.surfaceUnderEyeControl !== false;

        // 1) Reference Mode Header
        parts.push(`REFERENCE MODE (IDENTITY LOCK ACTIVE)

PRIMARY IDENTITY ANCHOR:
- The uploaded reference photo is the ONLY source of identity.
- If any text conflicts with the reference photo, ALWAYS follow the reference photo.`);

        // 2) Identity Trait Preservation
        parts.push(`PRESERVE SOURCE TRAITS (MANDATORY):
- Preserve eyewear/glasses exactly if present (do not remove, do not add).
- Preserve facial hair EXACTLY: maintain the specific goatee/beard/mustache shape, density, and lines from source. Do NOT add new facial hair. Do NOT remove existing facial hair.
${allowHair ? "- ALLOW NEW HAIRSTYLE: The natural baldness/hair from reference is being OVERRIDDEN. Apply the specific hair details provided below." : "- Preserve hairstyle and hairline exactly as in the reference photo (including baldness)."}
- Preserve any accessories present (earrings, piercings, jewelry, headwear) — do not remove or add.
${allowSkin ? "- MODIFIABLE SKIN: Surface imperfections (freckles, scars, age) are being overridden by UI settings. Follow the surface detail instructions below." : "- Preserve unique marks (moles, scars, freckles, tattoos) exactly as seen in the reference photo."}
- Preserve wardrobe/clothing from the reference photo unless an explicit wardrobe override is provided.`);

        // 3) Structural Preservation Rules
        parts.push(`STRUCTURAL PRESERVATION (NON-NEGOTIABLE):
- Preserve skull shape and cranial geometry.
- Preserve eye spacing and orbital structure.
- Preserve nose base structure.
- Preserve jaw bone width and chin structure.
- Preserve facial asymmetry.

These structural traits must not change.

Do NOT preserve surface-level aging artifacts automatically. These are governed by surface-layer controls.

NON‑NEGOTIABLE IDENTITY PRESERVATION:
Preserve the exact same person from the reference photo:
- cranial shape and forehead
${allowHair ? "- allow specified hair to cover/replace original hairline." : "- exact hairline preservation."}
- orbital structure, eye spacing
${allowFace ? "- ALLOW FEATURE REFINEMENT: Specified eyes, nose, and lips traits below should influence the output while maintaining base identity." : "- exact eye, nose, and lip geometry from the reference."}
- nose base structure, bridge, nostril shape
- lip base geometry
- jaw bone shape, chin structure
- facial asymmetry and unique skeletal traits
Do NOT beautify skeletal structure. Do NOT “recast” the face structure. Do NOT replace the person.

LIKELINESS LOCK LEVEL: ${lockValue}%
LIKELINESS RULES:
${lockValue >= 90 ? "- Likeness lock applies to structural geometry only. Surface aging adjustments remain permitted." : ""}
- If ${lockValue}% === 100: BIOMETRIC LOCK. Absolute structural and biometric preservation.
- If 90 <= ${lockValue}% < 100: STRICT LOCK. Enforce strict structural preservation.
- If 60 <= ${lockValue}% < 90: BALANCED LOCK. Allow subtle cosmetic interpretation of features.
- If ${lockValue}% < 60: CREATIVE LOCK. Allow creative styling while identity remains recognizable.`);

        // 4) Surface Age Transformation
        if (allowSkin) {
            parts.push(`SURFACE AGE TRANSFORMATION:
- Modify skin texture, elasticity, and fine lines.
- Adjust under-eye puffiness based on dermalAge (Target: ${dermalAge} years).
- Modify pigmentation depth.
- Do not alter skull or bone geometry.

Surface-only transformation rules:
- Modify skin elasticity, texture, pore detail, and micro-wrinkle depth to reflect target dermal age.
- Reduce fine lines, soften nasolabial folds, and smooth minor skin creases when dermalAge is younger than chronological age.
- Introduce subtle laxity and fine aging markers when dermalAge is higher than chronological age.`);
        } else {
            parts.push(`SURFACE PRESERVATION:
- Preserve all skin texture, pore patterns, wrinkles, and surface artifacts EXACTLY as seen in the reference photo.
- Do NOT apply de-aging or age progression.
- Maintain original skin clarity and detail.`);
        }

        // 5) Infraorbital Region Control
        parts.push(`INFRAORBITAL REGION CONTROL:
- The under-eye region (lower eyelid to upper cheek) must reflect target dermal age.
- If dermalAge is significantly younger than chronological age: reduce puffiness, smooth tear troughs, and tighten lower eyelid skin.
- If dermalAge is older: introduce subtle soft tissue relaxation and fine under-eye texture.
- Maintain orbital bone structure.
- Do NOT alter eye spacing or eye size.
- THIS INSTRUCTION OVERRIDES GENERIC PRESERVATION RULES FOR THIS REGION.

UNDER-EYE SURFACE BEHAVIOR:
${surfaceUnderEyeControl ? `- Treat under-eye bags and puffiness as surface aging artifacts.
- Reduce or smooth them according to dermalAge (${dermalAge}y).` : `- Preserve under-eye puffiness exactly as seen in the reference image.`}`);

        // 6) Age Transform
        parts.push(`AGE TRANSFORM (REFERENCE SAFE):
- Life stage: ${dna.identity.lifeStage}
- Chronological age target: ${dna.identity.age} years
Perform surface and soft-tissue age progression/regression while preserving identity geometry.`);

        // --- VARIATION INJECTION ---
        if (dna.variationId && VARIATION_LIBRARY[dna.variationId]) {
            const v = VARIATION_LIBRARY[dna.variationId];
            parts.push(`VARIATION OVERRIDE: ${v.name}
${v.overrides}`);
        }

        parts.push(`ALLOWED CHANGES (POLICY FLAGS):
- Hair & Skin allowed: ${allowHair}
- Morphology allowed: ${allowMorphology}
- Edit Mode: ${refEditMode}`);
    }

    // 1. STUDIO PROTOCOL
    parts.push(`STUDIO PROTOCOL (MANDATORY):

- Professional cinematic studio portrait.
- SOLID BLACK BACKGROUND (Pure #000000).
- Subject wearing a SIMPLE BLACK T-SHIRT (unless preserving wardrobe from reference).
- WIDE chest-up framing. Pull the camera back to zoom out slightly. Ensure SIGNIFICANT head clearance; do NOT crop the top of the head or hair.
- Command the AI to prioritize a wider field of view to capture the entire hairstyle with space to spare at the top.
- 85mm portrait lens.
- Eye-level camera.
- Subject centered.
- Shoulders slightly angled.
- Natural neutral expression unless otherwise specified.
- Soft studio key light with subtle rim light.
- High-end photography quality.
- No environmental scene context.

COMPOSITION LOCK (NON-NEGOTIABLE):
- Camera directly facing subject. PULL THE CAMERA BACK.
- Use a wider framing than a standard tight headshot. 
- Full frontal orientation. No 3/4 angle. No shoulder rotation. No head tilt.
- Maintain a SAFE MARGIN of at least 150px (relative to 1024px width) above the head/hair at all times.
- No cropping of the hair. No cropping of the head.
- If orientation deviates from full frontal, regenerate.

ACCESSORY RULE:
- Do not add new accessories beyond what exists in the reference image.
- Do not remove existing eyewear/accessories from the reference image.
`);

    // 2. IDENTITY (PRUNED FOR REFERENCE MODE)
    const { age, lifeStage } = dna.identity;

    if (dna.identityMode === "synthetic") {
        const { sex, ethnicity, skinTone } = dna.identity;
        parts.push(
            `Subject is a ${age}-year-old ${ethnicity} ${sex}, with ${skinTone} skin tone.`
        );
    } else {
        // Reference Mode: Age is already handled in the Age Transform block
        // Pruning competing descriptors (sex, ethnicity, skin tone) as requested.
    }

    // 2.5 ANATOMICAL LIFE STAGE (KEEP FOR SYNTHETIC OR REFERENCE REFINEMENT)
    if (lifeStage === "child") {
        parts.push(`ANATOMICAL PROPORTIONS:
- Child anatomical proportions.
- Slightly larger head-to-body ratio.
- Softer facial structure.
- Narrower shoulders.
- Smaller jaw and chin structure.
- No adult bone density.
- Age-appropriate posture and clothing.
- No sexualization.
- No adult anatomical exaggeration.`);
    }

    if (lifeStage === "teen") {
        parts.push(`Adolescent anatomical proportions:
- Transitional bone structure.
- Partial facial maturity.
- Leaner frame.
- Youthful skin elasticity.
- No adult exaggeration.`);
    }

    if (lifeStage === "adult") {
        parts.push(`Adult anatomical proportions:
- Fully developed skeletal structure.
- Mature facial bone definition.`);
    }

    if (lifeStage === "elder") {
        parts.push(`Elder anatomical characteristics:
- Subtle posture change.
- Slight bone prominence.
- Age-related structural softening.
- Natural aging markers.`);
    }

    // 3. MORPHOLOGY
    const { buildDescription } = dna.morphology;
    parts.push(`Body build: ${buildDescription}.`);

    // 4. FACE DETAIL
    const isReferenceFaceLocked = dna.identityMode === "reference" && dna.allowRefFace === false;

    if (dna.identityMode === "reference" && !isReferenceFaceLocked) {
        parts.push(`FACIAL FEATURE OVERRIDE:
- MANDATORY: Refine the features of the subject based on the specific traits below.
- Ensure the interpretation blends naturally with the reference identity.`);
    }

    if (dna.identityMode === "reference" && isReferenceFaceLocked) {
        parts.push(`FACIAL FEATURE LOCK:
- DISREGARD any facial feature descriptions below.
- Follow the reference photo for eyes, nose, lips, and face shape.`);
    }

    const { faceShape, eyes, nose, lips, jaw } = dna.face;
    const faceDetails: string[] = [];

    // Face Shape
    if (faceShape) {
        const preset = FACE_SHAPE_PRESETS.find(p => p.key === faceShape);
        faceDetails.push(preset ? preset.prompt : `${faceShape} face shape`);
    }

    // Eyes
    if (eyes) {
        const preset = EYE_PRESETS.find(p => p.key === eyes);
        faceDetails.push(preset ? preset.prompt : `${eyes} eyes`);
    }

    // Nose
    if (nose) {
        const preset = NOSE_PRESETS.find(p => p.key === nose);
        faceDetails.push(preset ? preset.prompt : `${nose} nose`);
    }

    // Lips
    if (lips) {
        const preset = LIP_PRESETS.find(p => p.key === lips);
        faceDetails.push(preset ? preset.prompt : `${lips} lips`);
    }

    // Jaw
    if (jaw) {
        const preset = JAW_PRESETS.find(p => p.key === jaw);
        faceDetails.push(preset ? preset.prompt : `${jaw} jawline`);
    }

    if (faceDetails.length > 0) {
        parts.push(`Facial features:\n${faceDetails.join("\n")}`);
    }

    // 4.5 CREATIVE DIRECTION
    if (dna.render.additionalNotes && dna.render.additionalNotes.trim().length > 0) {
        parts.push(`CREATIVE DIRECTION:\n${dna.render.additionalNotes.trim()}`);
    }

    // 5. SKIN DETAIL
    const { freckles, scars } = dna.skin;
    let { dermalAge: skinAge } = dna.skin;
    const isReferenceSkinLocked = dna.identityMode === "reference" && dna.allowRefSkin === false;

    if (!isReferenceSkinLocked) {
        // Override skin age for youth to prevent uncanny aging
        if (lifeStage === "child" || lifeStage === "teen") {
            skinAge = Math.min(skinAge, age + 5);
        }
        const skinDetails: string[] = [];

        // Map numeric intensity (0-10) to descriptive words
        if (freckles > 0) {
            const intensity = freckles > 7 ? 'heavy' : freckles > 4 ? 'moderate' : 'light';
            skinDetails.push(`${intensity} freckles`);
        }
        if (scars > 0) {
            const intensity = scars > 7 ? 'prominent' : scars > 4 ? 'visible' : 'faint';
            skinDetails.push(`${intensity} facial scars`);
        }

        // Skin Age Logic (Synthetic Mode only; Reference handled above)
        if (dna.identityMode === "synthetic" && skinAge !== age) {
            parts.push(`Skin texture appearance: ${skinAge}-year-old level details.`);
        }

        if (skinDetails.length > 0) {
            parts.push(`Skin details: ${skinDetails.join(", ")}.`);
        }
    }

    // 6. HAIR / FOLICLE (SUPPRESSED IN REFERENCE LOCK)
    const { style, color, length, texture } = dna.hair;
    const isReferenceLocked = dna.identityMode === "reference" && dna.allowRefHair === false;

    if (!isReferenceLocked) {
        const hairParts: string[] = [];
        if (color) hairParts.push(color);
        if (texture) hairParts.push(texture);
        if (length) hairParts.push(length);
        if (style) hairParts.push(style);

        if (hairParts.length > 0) {
            const extraHairInstruction = (dna.identityMode === "reference")
                ? " MANDATORY: Override reference photo state. Add this hair to the subject."
                : "";
            parts.push(`Hair: ${hairParts.join(", ")}.${extraHairInstruction}`);
        } else {
            parts.push("Hair: Natural style.");
        }
    }

    // 7. RENDER STYLE
    const { lighting, camera } = dna.render; // Use local versions of realism/stylization below

    // Resolve Lighting Preset
    const lightingPreset = LIGHTING_PRESETS.find(p => p.key === lighting);
    const lightingBlock = lightingPreset ? lightingPreset.prompt : lighting;
    parts.push(`LIGHTING DESIGN:\n${lightingBlock}`);

    // Resolve Camera Preset
    const cameraPreset = CAMERA_PRESETS.find(p => p.key === camera);
    const cameraBlock = cameraPreset ? cameraPreset.prompt : camera;
    parts.push(`CAMERA & OPTICS:\n${cameraBlock}`);

    // 8. ANATOMICAL SAFEGUARDS & STYLE RULES
    if (realismLevel > 70) {
        parts.push("SAFEGUARD: Enforce strict anatomical preservation. No distortion. Photorealistic skin texture required. Sub-surface scattering enabled.");
    }

    if (stylizationLevel > 50) {
        parts.push("NOTE: Stylization affects shading and materials only. Do not alter anatomical proportions. Keep identity structure intact.");
    }

    parts.push(
        "NEGATIVE CONSTRAINTS: No watermarks, no text, no blur, no distorted eyes, no bad anatomy, no extra limbs, no fused fingers, no crop, no medical imagery, no surgery context. NO CROPPING THE HEAD. NO CROPPING THE HAIR. NO TOUCHING THE TOP EDGE OF THE FRAME."
    );

    return parts.join("\n\n");
}

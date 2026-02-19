
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
    { key: "135mm Tight Portrait", label: "135mm Tight Portrait", category: "Portrait Standard", description: "High compression, tight focus", prompt: "135mm telephoto lens. High compression. Very tight framing focus. Background completely compressed/blurred." },

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

export function buildPortraitPrompt(dna: CharacterDNA): string {
    const parts: string[] = [];

    // 1. STUDIO PROTOCOL
    parts.push(`STUDIO PROTOCOL (MANDATORY):

- Professional cinematic studio portrait.
- SOLID BLACK BACKGROUND (Pure #000000).
- Subject wearing a SIMPLE BLACK T-SHIRT.
- Chest-up framing only.
- 85mm portrait lens.
- Eye-level camera.
- Subject centered.
- Shoulders slightly angled.
- Natural neutral expression unless otherwise specified.
- Soft studio key light with subtle rim light.
- High-end photography quality.
- No environmental scene context.

COMPOSITION LOCK (NON-NEGOTIABLE):
- Camera directly facing subject.
- Full frontal orientation.
- No 3/4 angle.
- No shoulder rotation.
- No head tilt.
- Both eyes equidistant from frame edges.
- Face plane parallel to camera sensor.
- Symmetrical framing.
- Do not angle the body.
- Do not rotate the subject.
- If orientation deviates from full frontal, regenerate.`);

    // 2. IDENTITY
    const { sex, ethnicity, age, skinTone, lifeStage } = dna.identity;
    parts.push(
        `Subject is a ${age}-year-old ${ethnicity} ${sex}, with ${skinTone} skin tone.`
    );

    // 2.5 ANATOMICAL LIFE STAGE
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
    // 4. FACE DETAIL
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
    let { skinAge } = dna.skin;

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

    // Skin Age Logic
    if (skinAge !== age) {
        parts.push(`Skin texture appearance: ${skinAge}-year-old level details.`);
    }

    if (skinDetails.length > 0) {
        parts.push(`Skin details: ${skinDetails.join(", ")}.`);
    }

    // 6. HAIR
    const { style, color, length, texture } = dna.hair;
    const hairParts: string[] = [];
    if (color) hairParts.push(color);
    if (texture) hairParts.push(texture);
    if (length) hairParts.push(length);
    if (style) hairParts.push(style);

    if (hairParts.length > 0) {
        parts.push(`Hair: ${hairParts.join(", ")}.`);
    } else {
        parts.push("Hair: Natural style.");
    }

    // 7. RENDER STYLE
    const { lighting, camera, realismLevel, stylizationLevel } = dna.render;

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

    // 9. NEGATIVE CONSTRAINTS
    parts.push(
        "NEGATIVE CONSTRAINTS: No watermarks, no text, no blur, no distorted eyes, no bad anatomy, no extra limbs, no fused fingers, no crop, no medical imagery, no surgery context."
    );

    return parts.join("\n\n");
}

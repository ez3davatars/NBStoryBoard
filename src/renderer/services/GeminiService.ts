import type { VeoFivePartDraft, VeoAudioBlock } from '../promptEngine/veoFivePart';

export const GeminiService = {

  // Helper: Convert Blob/Data URL to Base64
  async _resolveImageData(url: string, maxSize: number = 3072): Promise<{ mimeType: string; data: string }> {
    if (!url) throw new Error("No URL provided to _resolveImageData");

    let resolvedMimeType = '';
    let resolvedData = '';

    // 1. Handle Base64 Data URL
    if (url.startsWith('data:')) {
      try {
        resolvedMimeType = url.substring(url.indexOf(':') + 1, url.indexOf(';'));
        resolvedData = url.split('base64,')[1];
        if (!resolvedData) throw new Error("Invalid base64 data");
      } catch (e) {
        throw new Error("Failed to parse base64 data URL");
      }
    }
    // 2. Handle Blob URL (or any fetchable URL)
    else if (url.startsWith('blob:') || url.startsWith('http')) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
        const blob = await response.blob();
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            try {
              resolvedMimeType = result.substring(result.indexOf(':') + 1, result.indexOf(';'));
              resolvedData = result.split('base64,')[1];
              resolve();
            } catch (e) {
              reject(new Error("Failed to parse blob to base64"));
            }
          };
          reader.onerror = () => reject(new Error("FileReader error"));
          reader.readAsDataURL(blob);
        });
      } catch (e: any) {
        throw new Error(`Failed to resolve image data from ${url.startsWith('blob:') ? 'blob' : 'URL'}: ${e.message}`);
      }
    }
    // 3. Handle Raw Base64 (Assume PNG)
    else if (url.length > 100) { // Simple heuristic for raw base64
      resolvedMimeType = 'image/png';
      resolvedData = url;
    } else {
      throw new Error(`Invalid image URL format: ${url.substring(0, 50)}...`);
    }

    // 4. Downscale Guardian - Protects Gemini REST API from Deadline Exceeded timeouts on massive uncompressed Turnaround sheets
    try {
      // Reconstruct temporary data URI
      const tempUrl = `data:${resolvedMimeType};base64,${resolvedData}`;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = tempUrl;
      });

      const MAX_SIZE = maxSize || 3072; // Gemini multi-image payload limit logic
      let targetW = img.width;
      let targetH = img.height;
      
      if (targetW > MAX_SIZE || targetH > MAX_SIZE) {
          const ratio = Math.min(MAX_SIZE / targetW, MAX_SIZE / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
          
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0, targetW, targetH);
              // Re-encode as JPEG for highly aggressive JSON payload reduction over IPC
              const optimizedUrl = canvas.toDataURL('image/jpeg', 0.85);
              resolvedMimeType = 'image/jpeg';
              resolvedData = optimizedUrl.split('base64,')[1];
          }
      }
    } catch (err) {
      console.warn('[GeminiService] Image downscale Guardian failed, falling back to original extracted base64.', err);
    }

    return { mimeType: resolvedMimeType, data: resolvedData };
  },

  // Helper: sanitize + reframe prompts for Gemini 3.x native image generation
  _sanitizeImagePromptForGemini(prompt: string): { prompt: string; avoidBullets: string[] } {
    let p = (prompt || '').trim();
    const avoid: string[] = [];

    // Remove MJ/SD style aspect tokens; aspect ratio is controlled via imageConfig.aspectRatio
    p = p.replace(/\s--ar\s+[^\s]+/gi, '').trim();

    // Convert `--no ...` into avoid tokens
    const noMatch = p.match(/\s--no\s([^\n]+)$/i);
    if (noMatch?.[1]) {
      avoid.push(...noMatch[1].split(',').map(s => s.trim()).filter(Boolean));
      p = p.replace(/\s--no\s[^\n]+$/i, '').trim();
    }

    // Convert the Director prompt's NEGATIVE CONSTRAINTS block into bullets
    const negBlockMatch = p.match(/\n\nNEGATIVE\s+CONSTRAINTS[\s\S]*?:\s*([\s\S]+)$/i);
    if (negBlockMatch?.[1]) {
      const negCsv = negBlockMatch[1].trim();
      // Remove the negative block from the main prompt
      p = p.replace(/\n\nNEGATIVE\s+CONSTRAINTS[\s\S]*?$/i, '').trim();
      avoid.push(...negCsv.split(',').map(s => s.trim()).filter(Boolean));
    }

    // Deduplicate avoid bullets
    const seen = new Set<string>();
    const avoidBullets = avoid.filter(a => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Gemini 3 image prompting tends to respond better to a simple leading instruction
    // Keep original content intact; just add a short "create an image" header.
    const header = "Create a single image following ALL requirements below.";
    const finalPrompt =
      p.toLowerCase().startsWith('create ') || p.toLowerCase().startsWith('generate ')
        ? p
        : `${header}\n\n${p}`;

    return { prompt: finalPrompt.trim(), avoidBullets };
  },


  // Helper: build a safe thinkingConfig for the given model.
  // NOTE: Gemini 3.1 Flash Image supports only `minimal` (default) and `high`.
  // Passing legacy values like "low" will cause a 400.
  _buildThinkingConfigForModel(model: string, level?: string): any | undefined {
    if (!level) return undefined;
    const lv = String(level).trim().toLowerCase();

    // Nano Banana 2 (Gemini 3.1 Flash Image Preview)
    if (model === "gemini-3.1-flash-image-preview") {
      // Default thinkingLevel is `minimal`; only set config when explicitly requesting High.
      if (lv === "high") return { thinkingLevel: "High" };
      return undefined;
    }

    // Nano Banana Pro (Gemini 3 Pro Image Preview) – keep conservative defaults until we confirm full enum support.
    if (model === "gemini-3-pro-image-preview") {
      if (lv === "high") return { thinkingLevel: "High" };
      return undefined;
    }

    // Fallback for other Gemini 3 models (if used elsewhere)
    if (/^gemini-3/i.test(model)) {
      if (["minimal", "low", "medium", "high"].includes(lv)) return { thinkingLevel: lv };
    }

    return undefined;
  },

  async generateImage(
    prompt: string,
    apiKey: string,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: { aspectRatio?: string, imageSize?: '1K' | '2K' | '4K', thinkingLevel?: boolean | 'minimal' | 'low' | 'medium' | 'high', googleGrounding?: boolean, strictMode?: boolean } = {}
  ): Promise<string> {

    if (!apiKey) {
      console.warn("No API Key. Running in simulation mode.");
      await new Promise(r => setTimeout(r, 1500));
      return `https://placehold.co/1024x576/1a1a1a/FFF?text=Demo+Mode:+${encodeURIComponent(prompt.substring(0, 20))}`;
    }

    // MULTIMODAL PIPELINE (Gemini)
    if (model.includes('gemini')) {
      const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const contentsParts: any[] = [];

      // Debug log in dev
      console.log("Multimodal images attached:", referenceImages.length);

      // Inject references first
      let imgIndex = 1;
      for (const ref of referenceImages) {
        if (imgIndex > 14) break;

        if (!ref.url) {
          throw new Error(`Multimodal Error: Reference image ${imgIndex} has no URL.`);
        }

        contentsParts.push({ text: `[IMAGE ${imgIndex}] ${ref.label}` });
        const inline = await GeminiService._resolveImageData(ref.url);
        contentsParts.push({
          inlineData: { mimeType: inline.mimeType, data: inline.data }
        });
        imgIndex++;
      }

      // Inject prompt last for better "instruction following" on the visual context
      // --- Prompt normalization for Gemini 3.x image models ---
      // The Nano Banana 2 model is more sensitive to prompt structure; we normalize common legacy tokens
      // and move "avoid" constraints into a short bullet list near the top for stronger compliance.
      const strictMode = options.strictMode ?? /SPATIAL PROTOCOL|NEGATIVE CONSTRAINTS|CRITICAL\s*-\s*DO NOT|NON-NEGOTIABLE/i.test(prompt);

      const sanitized = GeminiService._sanitizeImagePromptForGemini(prompt);
      let finalPrompt = sanitized.prompt;

      if (strictMode && sanitized.avoidBullets.length > 0) {
        const avoidBlock =
          `NON-NEGOTIABLE (DO NOT INCLUDE):\n` +
          sanitized.avoidBullets.map(a => `- ${a}`).join('\n') +
          `\n\nIf any requirement conflicts, follow NON-NEGOTIABLE first.`;

        // Insert avoid block near the top (after the first paragraph) to improve compliance.
        const firstBreak = finalPrompt.indexOf('\n\n');
        if (firstBreak !== -1) {
          finalPrompt = finalPrompt.slice(0, firstBreak + 2) + avoidBlock + '\n\n' + finalPrompt.slice(firstBreak + 2);
        } else {
          finalPrompt = finalPrompt + '\n\n' + avoidBlock;
        }
      }

      contentsParts.push({ text: finalPrompt });

      const useGrounding =
        (options.googleGrounding !== false) && !strictMode && referenceImages.length === 0;

      const rawThinking =
        typeof options.thinkingLevel === 'string'
          ? options.thinkingLevel
          : options.thinkingLevel === true
            ? 'high'
            : undefined;

      // For strict prompts we default to higher thinking to improve instruction-following.
      // (Gemini 3.1 Flash Image default is `minimal`; `high` usually helps with long, rule-heavy prompts.)
      const desiredThinkingLevel = rawThinking ?? (strictMode ? 'high' : undefined);

      const requestBody: any = {
        contents: [{ parts: contentsParts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: {
            aspectRatio: options.aspectRatio || "16:9",
            ...(options.imageSize && { imageSize: options.imageSize })
          }
        },
        ...(useGrounding ? {
          tools: [
            {
              googleSearch: {
                searchTypes: {
                  webSearch: {},
                  imageSearch: {}
                }
              }
            }
          ]
        } : {})
      };

      const thinkingConfig = GeminiService._buildThinkingConfigForModel(model, desiredThinkingLevel);
      if (thinkingConfig) {
        requestBody.generationConfig.thinkingConfig = thinkingConfig;
      }

      let response = await fetch(`${baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errText = await response.text();
        console.error("Gemini API Error Response:", errText);
        let cleanMsg = errText;
        try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }

        // If a model rejects our thinkingLevel, retry once without thinkingConfig (falls back to model default).
        const thinkingRejected =
          response.status === 400 &&
          /thinking level/i.test(cleanMsg) &&
          /not supported/i.test(cleanMsg) &&
          requestBody?.generationConfig?.thinkingConfig;

        if (thinkingRejected) {
          console.warn("Gemini: thinkingLevel rejected by model; retrying without thinkingConfig.");
          delete requestBody.generationConfig.thinkingConfig;

          response = await fetch(`${baseUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            errText = await response.text();
            console.error("Gemini API Error Response (retry):", errText);
            cleanMsg = errText;
            try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
            throw new Error(`Gemini Error (${response.status}): ${cleanMsg}`);
          }
        } else {
          throw new Error(`Gemini Error (${response.status}): ${cleanMsg}`);
        }
      }

      const result = await response.json();
      const imgData = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
      if (!imgData) throw new Error("No image returned from Gemini.");
      return `data:image/png;base64,${imgData}`;
    }

    // TEXT-TO-IMAGE PIPELINE (Imagen)
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict";
    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: { sampleCount: 1 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Imagen Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const b64 = result.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) throw new Error("No image returned from Imagen.");
    return `data:image/png;base64,${b64}`;
  },

  // Vision/Text-only analysis from a single image (returns model text)
  async analyzeImage(
    prompt: string,
    apiKey: string,
    _model: string,
    imageUrl: string
  ): Promise<string> {
    if (!apiKey) throw new Error("No API Key provided.");
    // Force a vision-text model for analysis to avoid modality errors with generation models
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const inline = await GeminiService._resolveImageData(imageUrl, 1024);
    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: inline.mimeType, data: inline.data } }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Analyze Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const textOut = parts.map((p: any) => p.text).filter(Boolean).join("\n").trim();
    if (!textOut) throw new Error("No text returned from analysis.");
    return textOut;
  },

  // Multi-frame reasoning for Motion Director (Start + End frames)
  async analyzeMultiFrame(
    prompt: string,
    apiKey: string,
    _model: string,
    frames: { url: string; label: string }[]
  ): Promise<string> {
    if (!apiKey) throw new Error("No API Key provided.");
    // Multi-frame reasoning requires a vision-capable text model
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const parts: any[] = [];

    // 1. Inject frames with labels
    let idx = 1;
    for (const frame of frames) {
      parts.push({ text: `[FRAME ${idx}: ${frame.label}]` });
      const inline = await GeminiService._resolveImageData(frame.url, 1024);
      parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } });
      idx++;
    }

    // 2. Inject the reasoning prompt
    parts.push({ text: prompt });

    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Multi-Frame Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const textOut = result.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    if (!textOut) throw new Error("No reasoning generated.");
    return textOut;
  },

  async analyzeMultiFrameJson<T>(
    prompt: string,
    apiKey: string,
    model: string,
    frames: { url: string; label: string }[]
  ): Promise<T> {
    const strictPrompt = `
       ${prompt}
       
       CRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown formatting. No code fences. No commentary.
     `;

    // Reuse the underlying fetch logic or just call analyzeMultiFrame if acceptable. 
    // For safety/types, let's call the base method since it returns string.
    const rawText = await GeminiService.analyzeMultiFrame(strictPrompt, apiKey, model, frames);

    try {
      // Clean potentially messy output (e.g. ```json ... ```)
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

      // Handle cases where model adds text before/after JSON
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error("No JSON object found in response.");
      }

      const jsonString = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(jsonString) as T;
    } catch (e) {
      console.error("JSON Parse Error on:", rawText);
      throw new Error("Gemini failed to return valid JSON. Please try again.");
    }
  },


  /**
   * NanoBanana-style local edit using a binary mask.
   * - baseImageUrl: the image to edit
   * - maskDataUrl: black/white mask (white = edit, black = protect)
   * - instruction: what to do in the masked region
   *
   * Note: This uses Gemini image-capable models. If you pass Imagen model, call-site should route to a Gemini model.
   */
  async editImageWithMask(
    baseImageUrl: string,
    maskDataUrl: string,
    instruction: string,
    apiKey: string,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: { aspectRatio?: string } = {}
  ): Promise<string> {
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const base = await GeminiService._resolveImageData(baseImageUrl);
    const mask = await GeminiService._resolveImageData(maskDataUrl);

    const parts: any[] = [];

    // 1) Base image and edit mask
    parts.push({ inlineData: { mimeType: base.mimeType, data: base.data } });
    parts.push({ inlineData: { mimeType: mask.mimeType, data: mask.data } });

    // 2) Optional reference images
    for (const ref of referenceImages) {
      const r = await GeminiService._resolveImageData(ref.url);
      parts.push({ inlineData: { mimeType: r.mimeType, data: r.data } });
      parts.push({ text: `[REF] ${ref.label}` });
    }

    // 3) Instruction prompt
    const ar = options.aspectRatio ? `Target aspect ratio: ${options.aspectRatio}.` : '';
    parts.push({
      text: `
You are a precision image editor.

[IMAGE 1] is the BASE IMAGE.
[IMAGE 2] is the EDIT MASK (WHITE = allowed to change, BLACK = must not change).

Edit ONLY the WHITE regions. Preserve everything else exactly: identity, lighting, composition, camera, background, and unmasked pixels.

Instruction: ${instruction}
${ar}

Hard constraints:
- No new objects outside the mask.
- No morphing of faces/hair/body.
- No style drift outside the mask.
- No extra text/watermarks.
`
    });

    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Mask Edit Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const imgData =
      result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

    if (!imgData) throw new Error('No edited image returned from Gemini.');

    return `data:image/png;base64,${imgData}`;
  },

  async generateText(prompt: string, apiKey: string): Promise<string> {
    if (!apiKey) throw new Error("No API Key provided.");
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let cleanMsg = errText;
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch { }
      throw new Error(`Gemini Text Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const textOut = result.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    if (!textOut) throw new Error("No text generated.");
    return textOut;
  },

  async generateJson<T>(prompt: string, apiKey: string): Promise<T> {
    const strictPrompt = `${prompt}\n\nCRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown formatting. No code fences. No commentary.`;

    let rawText = await this.generateText(strictPrompt, apiKey);

    const tryParse = (text: string) => {
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) throw new Error("No JSON object found.");
      return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1)) as T;
    };

    try {
      return tryParse(rawText);
    } catch (e) {
      console.warn("First JSON parse failed, attempting repair... Raw text was:", rawText);
      const repairPrompt = `The following text was supposed to be valid JSON but failed to parse. Please fix it and return ONLY valid JSON.\n\n${rawText}`;
      rawText = await this.generateText(repairPrompt, apiKey);
      try {
        return tryParse(rawText);
      } catch (e2) {
        throw new Error("Gemini failed to return valid JSON even after repair.");
      }
    }
  },

  async generateVeoFivePartDraft(concept: string, apiKey: string, optionalContext?: string): Promise<VeoFivePartDraft & { audio?: VeoAudioBlock, negativePrompt?: string }> {
    if (!apiKey) {
      console.warn("No API Key. Returning mocked Veo prompt.");
      await new Promise(r => setTimeout(r, 1000));
      return {
        cinematography: "A wide establishing shot, 4k resolution, cinematic lighting.",
        subject: "A highly detailed robot standing in a neon-lit alley.",
        action: "The robot slowly turns its head towards the camera.",
        context: "Rain is pouring down, reflecting neon signs.",
        styleAmbiance: "Cyberpunk aesthetic, moody, dystopian.",
        negativePrompt: "morphing, extra limbs, extra objects, unwanted props, text, watermarks, deformed faces",
        audio: {
          sfx: "heavy rain falling, distant siren"
        }
      };
    }

    const prompt = `
You are an expert AI video director crafting prompts for Veo 3.1.
Convert the following user concept into a highly structured 5-part prompt draft.

User concept: "${concept}"
${optionalContext ? `Additional context: "${optionalContext}"` : ''}

Output a JSON object exactly matching this structure:
{
  "cinematography": "Camera angle, movement, focal length, lighting style",
  "subject": "Detailed description of the main subject/characters",
  "action": "Specific movement and dynamics. IMPORTANT: If the camera pans away and returns, explicitly state that the prop remains identical to enforce object permanence.",
  "context": "Background, environment, and setting elements",
  "styleAmbiance": "Overall visual style, mood, color palette, rendering engine details",
  "negativePrompt": "MANDATORY: A heavy, comma-separated list of extreme negative constraints to strictly prevent: morphing, changing props into different objects, mutating subjects, unwanted extra props, extra limbs, bad anatomy, deformed hands, missing hands, or style drift. CRITICAL: Include 'prop substitution, loss of object permanence, hallucinating new props'. Be very aggressive.",
  "audio": {
    "dialogue": "Spoken dialogue if requested",
    "sfx": "Sound effects if requested",
    "ambience": "Background audio ambience if requested",
    "music": "Musical style/cues if requested"
  }
}
Note: Leave audio fields out if not applicable. The core 5 parts are required.
`;

    return this.generateJson<any>(prompt, apiKey);
  }

};

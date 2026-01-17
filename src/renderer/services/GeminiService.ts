export const GeminiService = {

  // Helper: extract base64 + mime from data URL (or pass-through base64)
  _extractInlineData(url: string): { mimeType: string; data: string } {
    const data = url.includes('base64,') ? url.split('base64,')[1] : url;
    const mimeType = url.includes('data:') ? url.substring(url.indexOf(':') + 1, url.indexOf(';')) : 'image/png';
    return { mimeType, data };
  },

  async generateImage(
    prompt: string,
    apiKey: string,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: { aspectRatio?: string } = {}
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

      // Inject references first
      referenceImages.forEach((ref, index) => {
        if (index >= 14) return;
        contentsParts.push({ text: `[IMAGE ${index + 1}] ${ref.label}` });
        const inline = GeminiService._extractInlineData(ref.url);
        contentsParts.push({
          inlineData: { mimeType: inline.mimeType, data: inline.data }
        });
      });

      // Inject prompt last for better "instruction following" on the visual context
      contentsParts.push({ text: prompt });

      const response = await fetch(`${baseUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: contentsParts }],
          generationConfig: { 
            responseModalities: ["IMAGE"],
            imageConfig: {
              aspectRatio: options.aspectRatio || "16:9"
            }
          }
        })
      });

      if (!response.ok) {
        let errText = await response.text();
        console.error("Gemini API Error Response:", errText);
        let cleanMsg = errText;
        try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
        throw new Error(`Gemini Error (${response.status}): ${cleanMsg}`);
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
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
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
    const useModel = 'gemini-2.0-flash'; 
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const inline = GeminiService._extractInlineData(imageUrl);
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
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
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
    const useModel = 'gemini-2.0-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const parts: any[] = [];
    
    // 1. Inject frames with labels
    frames.forEach((frame, idx) => {
        parts.push({ text: `[FRAME ${idx+1}: ${frame.label}]` });
        const inline = GeminiService._extractInlineData(frame.url);
        parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } });
    });

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
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
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

    const base = GeminiService._extractInlineData(baseImageUrl);
    const mask = GeminiService._extractInlineData(maskDataUrl);

    const parts: any[] = [];

    // 1) Base image and edit mask
    parts.push({ inlineData: { mimeType: base.mimeType, data: base.data } });
    parts.push({ inlineData: { mimeType: mask.mimeType, data: mask.data } });

    // 2) Optional reference images
    for (const ref of referenceImages) {
      const r = GeminiService._extractInlineData(ref.url);
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
      try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
      throw new Error(`Gemini Mask Edit Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const imgData =
      result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

    if (!imgData) throw new Error('No edited image returned from Gemini.');

    return `data:image/png;base64,${imgData}`;
  }

};

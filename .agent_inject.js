const fs = require('fs');

const injectMethod = `
  /**
   * Generates a constrained repair pass over a raw 2.5D geometric projection.
   */
  async generateReprojectedShotRepair(args) {
    if (args.options && args.options.billingMode !== 'hosted' && !args.apiKey) {
      throw new Error("No API Key provided for repair generation");
    }

    const baseUrl = \`https://generativelanguage.googleapis.com/v1beta/models/\${args.model}:generateContent\`;
    const parts = [];

    const projMaxSize = args.options && args.options.billingMode === 'hosted' ? 1792 : 2304;
    const projected = await GeminiService._resolveImageData(args.projectedImageUrl, projMaxSize);
    parts.push({ text: "[RAW GEOMETRIC PROJECTION - FULL COMPOSITIONAL AUTHORITY]\\nCRITICAL: This image is the absolute mathematical truth for the shot layout. DO NOT alter the framing, perspective, subject positioning, or existing structures." });
    parts.push({ inlineData: { mimeType: projected.mimeType, data: projected.data } });

    if (args.anchorImageUrl) {
        const anchorMaxSize = args.options && args.options.billingMode === 'hosted' ? 1280 : 1536;
        const anchor = await GeminiService._resolveImageData(args.anchorImageUrl, anchorMaxSize);
        parts.push({ text: "[SCENE ANCHOR - TEXTURE & DETAIL REFERENCE]\\nUse this image strictly to understand the colors, materials, and lighting of the scene to accurately smooth and fill transparent voids in the projection." });
        parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } });
    }

    parts.push({ text: args.repairPrompt });

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: args.aspectRatio || "16:9",
          imageSize: "1K"
        }
      }
    };

    if (args.options && args.options.billingMode === 'hosted') {
        const hostedArgs = { ...args.options, expectedResponseType: 'image' };
        return await GeminiService._executeHostedRequest(args.model, payload, hostedArgs);
    }

    const response = await fetch(\`\${baseUrl}?key=\${args.apiKey}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: args.options && args.options.signal
    });

    if (!response.ok) {
      const err = await response.text();
      const cleanMsg = GeminiService._extractApiErrorMessage(err);
      throw new Error(\`Shot Repair Generation Error: \${cleanMsg}\`);
    }

    const result = await response.json();
    let data;
    try {
        const pts = result.candidates[0].content.parts || [];
        data = pts.find(p => p.inlineData && p.inlineData.data).inlineData.data;
    } catch {
        // Fallback or skip
    }
    
    if (!data) throw new Error("No image data in shot repair response.");

    return \`data:image/png;base64,\${data}\`;
  },
`;

const file = 'src/renderer/services/GeminiService.ts';
const content = fs.readFileSync(file, 'utf8');

// We are converting to TS natively by keeping the signature clean and just injecting it. 
// We will replace '  async generateShotPreview' with our block + '  async generateShotPreview'
const TS_INJECT = `
  /**
   * Generates a constrained repair pass over a raw 2.5D geometric projection.
   */
  async generateReprojectedShotRepair(args: {
    projectedImageUrl: string;
    holeMaskUrl?: string;
    anchorImageUrl?: string;
    actorIdentitySets?: import('../types/shots').ActorIdentityReferenceSet[];
    repairPrompt: string;
    aspectRatio?: string;
    apiKey: string;
    model: string;
    options?: import('./GeminiService.types').CommonGeminiOptions;
  }): Promise<string> {
    if (args.options?.billingMode !== 'hosted' && !args.apiKey) throw new Error("No API Key provided for repair generation");

    const baseUrl = \`https://generativelanguage.googleapis.com/v1beta/models/\${args.model}:generateContent\`;
    const parts: import('./GeminiService.types').GeminiPart[] = [];

    const projMaxSize = args.options?.billingMode === 'hosted' ? 1792 : 2304;
    const projected = await GeminiService._resolveImageData(args.projectedImageUrl, projMaxSize);
    parts.push({ text: "[RAW GEOMETRIC PROJECTION - FULL COMPOSITIONAL AUTHORITY]\\nCRITICAL: This image is the absolute mathematical truth for the shot layout. DO NOT alter the framing, perspective, subject positioning, or existing structures." });
    parts.push({ inlineData: { mimeType: projected.mimeType, data: projected.data } });

    if (args.anchorImageUrl) {
        const anchorMaxSize = args.options?.billingMode === 'hosted' ? 1280 : 1536;
        const anchor = await GeminiService._resolveImageData(args.anchorImageUrl, anchorMaxSize);
        parts.push({ text: "[SCENE ANCHOR - TEXTURE & DETAIL REFERENCE]\\nUse this image strictly to understand the colors, materials, and lighting of the scene to accurately smooth and fill transparent voids in the projection." });
        parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } });
    }

    parts.push({ text: args.repairPrompt });

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: args.aspectRatio || "16:9",
          imageSize: "1K"
        }
      }
    };

    if (args.options?.billingMode === 'hosted') {
        const hostedArgs = { ...args.options };
        if (!hostedArgs.expectedResponseType) hostedArgs.expectedResponseType = 'image';
        return await GeminiService._executeHostedRequest(args.model, payload, hostedArgs);
    }

    const response = await fetch(\`\${baseUrl}?key=\${args.apiKey}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: args.options?.signal
    });

    if (!response.ok) {
      const err = await response.text();
      const cleanMsg = GeminiService._extractApiErrorMessage(err);
      throw new Error(\`Shot Repair Generation Error: \${cleanMsg}\`);
    }

    const result = await response.json();
    let data;
    try {
        const resParts = result.candidates?.[0]?.content?.parts || [];
        data = resParts.find((p: any) => p.inlineData?.data)?.inlineData?.data;
    } catch {
        data = undefined;
    }
    
    if (!data) throw new Error("No image data in shot repair response.");

    return \`data:image/png;base64,\${data}\`;
  },
`;

const updatedContent = content.replace('  async generateShotPreview', TS_INJECT + '\\n  async generateShotPreview');
fs.writeFileSync(file, updatedContent);
console.log('Successfully injected generateReprojectedShotRepair');

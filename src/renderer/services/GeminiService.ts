import type { VeoFivePartDraft, VeoAudioBlock } from '../promptEngine/veoFivePart';
import type { ActorIdentityReferenceSet } from '../context/AppContext';
import { buildOrderedActorIdentityInputs, hasStrongFaceAnchor } from '../utils/identityReferenceHelpers';

export type ExtractedStyle = {
  medium?: string;
  palette?: string;
  lighting?: string;
  renderStyle?: string;
  mood?: string;
  styleSummary?: string;
  impliedEra?: string;
  impliedWorld?: string;
  architectureHints?: string;
  environmentMustAvoid?: string;
};

export type SceneIntent = {
  location?: string;
  action?: string;
  furniture?: string[];
  propContext?: string[];
  mood?: string;
  supportContext?: string[];
  mustInclude?: string[];
  mustAvoid?: string[];
  summary?: string;
  recommendedCamera?: string;
  recommendedLighting?: string;
};

export const GeminiService = {

  // Helper: Flatten structured actor references for multi-image Gemini injection
  flattenActorReferenceImageUrls(actorReferences: Array<{ actorId: string, referenceImageUrls: string[] }>): string[] {
    if (!actorReferences || actorReferences.length === 0) return [];
    
    const flattened: string[] = [];
    actorReferences.forEach(actor => {
      if (!actor.referenceImageUrls || actor.referenceImageUrls.length === 0) {
        console.warn(`[Face Fidelity] Actor ${actor.actorId} is missing reference images in pipeline.`);
      } else {
        flattened.push(...actor.referenceImageUrls);
      }
    });
    return flattened;
  },

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
      p = p.replace(/\n\nNEGATIVE\s+CONSTRAINTS[\s\S]*?$/i, '').trim();
      avoid.push(...negCsv.split(',').map(s => s.trim()).filter(Boolean));
    }

    // Convert the Environment generator's ABSOLUTE FINAL NEGATIVE PROMPT block into bullets
    const absNegMatch = p.match(/ABSOLUTE\s+FINAL\s+NEGATIVE\s+PROMPT:\s*([^\n]+)/i);
    if (absNegMatch?.[1]) {
        const absCsv = absNegMatch[1].trim();
        p = p.replace(/ABSOLUTE\s+FINAL\s+NEGATIVE\s+PROMPT:\s*[^\n]+/i, '').trim();
        avoid.push(...absCsv.split(',').map(s => s.trim()).filter(Boolean));
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

  async _executeHostedRequest(
    model: string,
    requestBody: any,
    options: {
      imageSize?: '1K' | '2K' | '4K',
      expectedResponseType?: 'image' | 'text' | 'json',
      onJobAccepted?: (generationId: string, acceptedAt?: number) => void,
      signal?: AbortSignal
    } = {}
  ): Promise<string> {
    if ((window as any).electronAPI && typeof (window as any).electronAPI.getWorkerStatus === 'function') {
        const workerState = await (window as any).electronAPI.getWorkerStatus();
        if (workerState.imageWorker.status !== 'online') {
            throw new Error(`Hosted Generation is unavailable because the required background worker is not currently online. Status: ${workerState.imageWorker.status}. Reason: ${workerState.imageWorker.lastError || 'None'}`);
        }
    }

    const { SupabaseAuth, supabase } = await import('./SupabaseClient');
    const token = await SupabaseAuth.getValidJwt();
    const idempotencyKey = "batch_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

    const payloadBodyForEdge = {
      model,
      requestBody
    };

    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(payloadBodyForEdge))
    );
    const executionFingerprint = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (!supabase) throw new Error('Supabase is not configured for hosted execution.');
    if (!token || token.split('.').length !== 3) {
      throw new Error('Hosted Execution Error: Missing or malformed user JWT');
    }

    const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`;
    const rawResponse = await fetch(edgeUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
        Accept: 'application/json'
      },
      body: JSON.stringify({
        payload: payloadBodyForEdge,
        options,
        executionFingerprint
      }),
      signal: options.signal
    });

    const responseText = await rawResponse.text();

    if (rawResponse.status === 202) {
      const data = JSON.parse(responseText);
      const genId = data.generationId;
      if (!genId) throw new Error('Hosted Generation Error: Received 202 but no generationId.');

      if (options.onJobAccepted) options.onJobAccepted(genId, data.acceptedAt);
      
      if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refresh-credits'));
      }

      let attempts = 0;
      let MAX_ATTEMPTS = 150; // 1K default (300s) to comfortably endure queuing delays
      if (options.imageSize === '2K') MAX_ATTEMPTS = 180; // 360s
      if (options.imageSize === '4K') MAX_ATTEMPTS = 240; // 480s
      
      while (attempts < MAX_ATTEMPTS) {
        if (options.signal?.aborted) throw new Error("AbortError: Canceled by user");
        await new Promise(r => setTimeout(r, 2000));
        if (options.signal?.aborted) throw new Error("AbortError: Canceled by user");
        attempts++;
        
        const { data: pollData, error: pollErr } = await supabase
          .from('generations')
          .select('status, asset_url, error_message, failure_code')
          .eq('id', genId)
          .single();
          
        if (pollErr) {
          console.warn(`[Hosted Polling] db fetch error:`, pollErr.message);
          continue; // Soft retry
        }
        
        if (pollData) {
          if (pollData.status === 'COMPLETED') {
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refresh-credits'));
            
            if (options.expectedResponseType === 'json' || options.expectedResponseType === 'text') {
               if (!pollData.asset_url) throw new Error("Hosted Execution Error: COMPLETED but missing analysis payload.");
               return pollData.asset_url; // Returns raw string (JSON/text) placed by worker
            }

            if (!pollData.asset_url) throw new Error("Hosted Generation Error: COMPLETED but missing asset_url.");
            return pollData.asset_url;
          }
          if (pollData.status === 'FAILED') {
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refresh-credits'));
            throw new Error(`Hosted Execution Error [${pollData.failure_code || 'PROVIDER_ERROR'}]: ${pollData.error_message}`);
          }
          if (pollData.status === 'EXPIRED') {
            throw new Error("Hosted Execution Error: Asset expired and was cleaned up. Please save locally in time.");
          }
          if (pollData.status === 'CANCELED') {
            throw new Error('Hosted Execution Error: Job was canceled manually.');
          }
        }
      }
      
      const timeoutErr = new Error('Hosted Generation Pending: Generation exceeded the current UI wait window and may still complete in the background.');
      timeoutErr.name = 'TimeoutError';
      (timeoutErr as any).generationId = genId;
      throw timeoutErr;
    }

    if (!rawResponse.ok) {
      throw new Error(`generate-image ${rawResponse.status}: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    return data.imageUrl;
  },


  async generateImage(
    prompt: string,
    apiKey: string,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: { aspectRatio?: string, imageSize?: '1K' | '2K' | '4K', thinkingLevel?: boolean | 'minimal' | 'low' | 'medium' | 'high', googleGrounding?: boolean, strictMode?: boolean, billingMode?: 'hosted' | 'byok', entitlements?: { hasHostedAccess: boolean, hasByokAccess: boolean, effectiveBillingMode: string }, onJobAccepted?: (generationId: string, acceptedAt?: number) => void } = {}
  ): Promise<string> {

    // --- API ACCESS LAYER ---
    // All features are available in both Hosted and BYOK. The only difference is API prerequisites.
    if (options.billingMode === 'byok' && !apiKey) {
      throw new Error("API Key required for BYOK generation.");
    }
    // Legacy fallback for older call-sites that don't send billing mode.
    if (!apiKey && options.billingMode !== 'hosted') {
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

      let host_supabase: any = null;
      let host_uid: string = 'anon';
      const executionBatchId = crypto.randomUUID();
      
      if (options.billingMode === 'hosted') {
         const clientRef = await import('./SupabaseClient');
         host_supabase = clientRef.supabase;
         if (!host_supabase) throw new Error("Supabase is not configured for hosted generation.");
         
         // Use strict getUser() specifically to guarantee fresh network validity instead of local session cache
         const userObj = await host_supabase.auth.getUser();
         host_uid = userObj.data?.user?.id || 'anon';
         
         if (host_uid === 'anon') {
             throw new Error("Authentication required: You must be logged into a valid Supabase session to use Hosted Mode uploads.");
         }
      }

      // Inject references first
      let imgIndex = 1;
      for (const ref of referenceImages) {
        if (imgIndex > 14) break;

        if (!ref.url) {
          throw new Error(`Multimodal Error: Reference image ${imgIndex} has no URL.`);
        }

        contentsParts.push({ text: `[IMAGE ${imgIndex}] ${ref.label}` });

        if (options.billingMode === 'hosted') {
            console.log(`[GeminiService] Uploading normalized 3072px reference bypass: ${ref.label}`);
            
            // CRITICAL FIX: We MUST use _resolveImageData even before uploading to storage.
            // Why? Because it uses native DOM <canvas> to enforce sRGB color space, flatten transparent pngs to solid background,
            // strictly apply EXIF rotation, and limit extreme resolutions to 3072px max.
            // If we upload the Raw Blob directly, Gemini API silently fails or ignores unoptimized/rotated alpha payloads,
            // resulting in complete identity hallucinations.
            const inline = await GeminiService._resolveImageData(ref.url, 3072);
            
            // Decode the canvas-normalized base64 back into a binary blob for storage upload
            // This prevents passing a multi-megabyte string into Edge Function networking.
            const byteString = atob(inline.data);
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let k = 0; k < byteString.length; k++) {
                ia[k] = byteString.charCodeAt(k);
            }
            const blob = new Blob([ab], { type: inline.mimeType });
            
            const fileExt = inline.mimeType.split('/')[1] || 'jpeg';
            const storagePath = `${host_uid}/${executionBatchId}/ref_${imgIndex}.${fileExt}`;
            
            console.log(`[Storage Proxy Pre-flight] Attempting high-fidelity bypass upload...`);
            console.log(`- Authenticated UID: ${host_uid}`);
            console.log(`- Exact Target Path: ${storagePath}`);
            console.log(`- Valid Session Detected? ${host_uid !== 'anon'}`);
            
            const { error } = await host_supabase.storage.from('reference_images').upload(storagePath, blob, { 
                contentType: inline.mimeType, 
                upsert: true 
            });
            
            if (error) {
                console.error("Storage bypass error:", error);
                throw new Error(`Failed to upload reference: ${error.message}`);
            }
            
            contentsParts.push({
                hosted_reference_path: storagePath,
                mimeType: inline.mimeType,
                label: ref.label,
                originalUrl: ref.url.substring(0, 50) + "..."
            });
        } else {
            // BYOK keeps the high fidelity 3072 local base64 pipeline
            const inline = await GeminiService._resolveImageData(ref.url, 3072);
            contentsParts.push({
              inlineData: { mimeType: inline.mimeType, data: inline.data }
            });
        }
        
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

      // Map extended UI aspect ratios to the strict subset supported natively by Gemini Image API
      let finalAspectRatio = options.aspectRatio || "16:9";
      if (finalAspectRatio === "4:5") finalAspectRatio = "3:4";
      else if (finalAspectRatio === "3:2") finalAspectRatio = "4:3";
      else if (finalAspectRatio === "21:9") finalAspectRatio = "16:9";

      const requestBody: any = {
        contents: [{ parts: contentsParts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: {
            aspectRatio: finalAspectRatio,
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
      if (options.billingMode === 'hosted') {
        return await GeminiService._executeHostedRequest(model, requestBody, options);
      }
      // ===============================================

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
    apiKey: string | null | undefined,
    _model: string,
    imageUrl: string,
    options: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any, expectedResponseType?: 'image' | 'text' | 'json' } = {}
  ): Promise<string> {
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
    // Force a vision-text model for analysis to avoid modality errors with generation models
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const inline = await GeminiService._resolveImageData(imageUrl, 1024);
    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: inline.mimeType, data: inline.data } }
        ]
      }]
    };

    if (options.billingMode === 'hosted') {
        const hostedDataUrl = await GeminiService._executeHostedRequest(useModel, requestBody, options);
        if (hostedDataUrl && hostedDataUrl.startsWith('data:application/json')) {
            return decodeURIComponent(hostedDataUrl.split(',')[1]);
        }
        return hostedDataUrl;
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
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
    apiKey: string | null | undefined,
    _model: string,
    frames: { url: string; label: string }[],
    options: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any, expectedResponseType?: 'image' | 'text' | 'json' } = {}
  ): Promise<string> {
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
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

    const requestBody = {
      contents: [{ parts }]
    };

    if (options.billingMode === 'hosted') {
        const rawResultText = await GeminiService._executeHostedRequest(useModel, requestBody, { ...options, expectedResponseType: 'text' });
        
        // Backwards compatibility purely for legacy payloads already queued
        if (rawResultText && rawResultText.startsWith('data:application/json')) {
            return decodeURIComponent(rawResultText.split(',')[1]);
        }
        return rawResultText;
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
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
    apiKey: string | null | undefined,
    model: string,
    frames: { url: string; label: string }[],
    options: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any, expectedResponseType?: 'image' | 'text' | 'json' } = {}
  ): Promise<T> {
    const strictPrompt = `
       ${prompt}
       
       CRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown formatting. No code fences. No commentary.
     `;

    // Reuse the underlying fetch logic or just call analyzeMultiFrame if acceptable. 
    // For safety/types, let's call the base method since it returns string.
    // Request explicit JSON payload typing for Edge normalization
    const rawText = await GeminiService.analyzeMultiFrame(strictPrompt, apiKey, model, frames, { ...options, expectedResponseType: 'json' });

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
   * Style Transfer Pipeline: Phase 1
   * Analyzes a character image to extract aesthetic style descriptors.
   */
  async analyzeCharacterStyle(
    imageUrl: string,
    apiKey: string | null | undefined,
    model: string = 'gemini-2.5-flash', // Defaulting to the fast multimodal model
    options: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any } = {}
  ): Promise<ExtractedStyle> {
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided for style analysis.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');

    const prompt = `Analyze this character image. Return a JSON object describing their exact artistic medium, color palette, mood, and inferred setting details based on their wardrobe/prop vocabulary.

    AESTHETICS:
    Do NOT describe the character's physical features or clothing. Only describe the aesthetic style (e.g., 3D animated, CG animated, pastel colors, cel-shaded, gritty cinematic, etc.). Return only style descriptors. No full sentences.

    CRITICAL LIGHTING RULE: Do NOT include character-specific or studio lighting descriptors (e.g., "soft studio lighting", "portrait lighting", "beauty lighting", "rim lighting", "flat"). These will conflict with environment generation later. If you describe lighting, keep it broad and environment-safe (e.g., "volumetric", "cinematic", "moody", or prioritize "mood").

    SETTING / WORLD INFERENCE:
    Look at the character's wardrobe, props, and silhouette. Infer the probable time period (e.g. Ancient, Biblical, Medieval, Cyberpunk, 1920s), world type (e.g. Desert village, Sci-Fi metropolis, High Fantasy castle), and derived architecture hints. Also note what environmental aesthetics would contradict the clothing.

    Return EXACTLY this JSON structure:
{
  "medium": "string (e.g., '3D render', 'Digital painting', 'Photograph')",
  "palette": "string (e.g., 'Cyberpunk neon', 'Muted earth tones')",
  "lighting": "string (e.g., 'Volumetric', 'Flat cel-shaded')",
  "renderStyle": "string (e.g., 'Unreal Engine 5', 'Anime')",
  "mood": "string (e.g., 'Gritty', 'Whimsical')",
  "styleSummary": "string (A comma-separated list of the best aesthetic descriptors)",
  "impliedEra": "string (e.g., 'Ancient/Pre-modern', 'Sci-Fi')",
  "impliedWorld": "string (e.g., 'Biblical town', 'Space station')",
  "architectureHints": "string (e.g., 'Stone and plaster, no modern glass')",
  "environmentMustAvoid": "string (A comma-separated list of things that contradict the era)"
}
    `;

    try {
      // Reuse the JSON generation logic with the image attached
      const result = await this.analyzeMultiFrameJson<ExtractedStyle>(
        prompt,
        effectiveKey,
        model,
        [{ url: imageUrl, label: 'Character Asset' }],
        options
      );
      
      if (!result || !result.styleSummary) {
          throw new Error("Invalid style analysis payload returned.");
      }

      return result;
    } catch (err: any) {
      console.error("[GeminiService.analyzeCharacterStyle] Failed:", err);
      throw new Error("Failed to extract style from character. Please try again.");
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
    apiKey: string | null | undefined,
    model: string,
    referenceImages: { url: string; label: string }[] = [],
    options: { aspectRatio?: string, imageSize?: '1K' | '2K' | '4K', billingMode?: 'hosted' | 'byok', entitlements?: any, expectedResponseType?: 'image' } = {}
  ): Promise<string> {
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
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
[IMAGE 2] is the EDIT MASK.

MASK RULES:
- WHITE = editable region
- BLACK = locked region

Perform the requested edit ONLY inside the white region.
Preserve all black-region pixels exactly.

Instruction: ${instruction}
${ar}

Hard constraints:
- Remove only the targeted non-anatomical object or material inside the white region.
- Preserve any nearby visible human anatomy exactly, including hands, fingers, face, hair, ears, neck, and exposed skin.
- Do not delete, repaint, deform, shorten, merge, blur, or replace human anatomy adjacent to the mask.
- If the masked object overlaps anatomy, remove the non-anatomical object only and reconstruct the obscured anatomy naturally.
- Do not change composition.
- Do not move or rescale subjects.
- Do not alter any unmasked region.
- Do not introduce new objects outside the white region.
- Do not change identity, face, hair, wardrobe, or body unless explicitly requested inside the mask.
- Match surrounding texture, lighting, and realism seamlessly.
- No text, no watermark, no extra artifacts.
`
    });

    let finalAspectRatio = options.aspectRatio || "16:9";
    if (finalAspectRatio === "4:5") finalAspectRatio = "3:4";
    else if (finalAspectRatio === "3:2") finalAspectRatio = "4:3";
    else if (finalAspectRatio === "21:9") finalAspectRatio = "16:9";

    const requestBody = {
        contents: [{ parts }],
        generationConfig: {
            responseModalities: ["IMAGE"],
            candidateCount: 1,
            imageConfig: {
                aspectRatio: finalAspectRatio,
                ...(options.imageSize && { imageSize: options.imageSize })
            },
            temperature: 0.2
        }
    };

    if (options.billingMode === 'hosted') {
        let payload = await GeminiService._executeHostedRequest(model, requestBody, options);

        if (payload && typeof payload === 'object') {
            try {
                payload = JSON.stringify(payload);
            } catch (e) {
                throw new Error('Hosted payload failure: could not serialize non-string response.');
            }
        }

        if (!payload || typeof payload !== 'string') {
            throw new Error(`Hosted payload failure. Expected string, got ${typeof payload}`);
        }

        const trimmed = payload.trim();

        // Case 1: Hosted worker already returned a usable image/data URL
        if (
            trimmed.startsWith('http://') ||
            trimmed.startsWith('https://') ||
            trimmed.startsWith('blob:') ||
            trimmed.startsWith('data:image/')
        ) {
            return trimmed;
        }

        // Case 2: Hosted worker returned raw Gemini JSON instead of finalized asset URL
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed);
                const extracted = parsed.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

                if (extracted && typeof extracted === 'string' && extracted.length > 100) {
                    return `data:image/png;base64,${extracted}`;
                }

                if (parsed.candidates?.[0]?.finishReason === 'SAFETY') {
                    throw new Error('Gemini refused the edit region due to safety constraints.');
                }

                throw new Error('Completed, but payload JSON did not contain usable image data.');
            } catch (e: any) {
                throw new Error(`Failed to parse hosted edit payload JSON: ${e.message}`);
            }
        }

        // Case 3: Raw base64
        if (trimmed.length > 500) {
            return `data:image/png;base64,${trimmed}`;
        }

        // Anything else is invalid and should never hit the UI
        throw new Error(`Hosted payload failure. Received non-image text: ${trimmed}`);
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
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

  async refineCompositeFromLayout(args: {
    apiKey: string;
    model?: string;
    sourceImageUrl: string;
    protectionMaskUrl?: string | null;
    editMaskUrl?: string | null;
    instructions: string;
  }): Promise<string> {
    const { apiKey, model = 'gemini-2.5-flash-image', sourceImageUrl, protectionMaskUrl, editMaskUrl, instructions } = args;
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const base = await GeminiService._resolveImageData(sourceImageUrl);
    const parts: any[] = [];
    
    parts.push({ inlineData: { mimeType: base.mimeType, data: base.data } });
    parts.push({ text: `[IMAGE 1] BASE IMAGE.` });

    let promptEnforcement = `Instruction: ${instructions}\n\n`;

    if (protectionMaskUrl) {
      const pMask = await GeminiService._resolveImageData(protectionMaskUrl);
      parts.push({ inlineData: { mimeType: pMask.mimeType, data: pMask.data } });
      parts.push({ text: `[IMAGE 2] PROTECTION MASK. WHITE = MUST PRESERVE/PROTECT EXACTLY. BLACK = UNPROTECTED.` });
      promptEnforcement += `- Strictly preserve all white pixels shown in the PROTECTION MASK without altering them.\n`;
    }

    if (editMaskUrl) {
      const eMask = await GeminiService._resolveImageData(editMaskUrl);
      parts.push({ inlineData: { mimeType: eMask.mimeType, data: eMask.data } });
      const imgIdx = protectionMaskUrl ? 3 : 2;
      parts.push({ text: `[IMAGE ${imgIdx}] EDIT ALLOWANCE MASK. WHITE = PREFERRED EDITABLE REGION. BLACK = DO NOT EDIT.` });
      promptEnforcement += `- Confine requested edits predominantly to the white pixels shown in the EDIT ALLOWANCE MASK.\n`;
    }

    if (!protectionMaskUrl && !editMaskUrl) {
      promptEnforcement += `- Perform a cautious, holistic refinement prioritizing the existing composition.\n`;
    }

    parts.push({
      text: `
You are a precision Scene Compositor.
${promptEnforcement}

Hard constraints:
- No new primary objects or characters.
- No morphing of faces/hair/body.
- No style drift.
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
      throw new Error(`Gemini Refine Error: ${cleanMsg}`);
    }

    const result = await response.json();
    const imgData = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;

    if (!imgData) throw new Error('No refined image returned from Gemini.');

    return `data:image/png;base64,${imgData}`;
  },

  /**
   * Calculates the Levenshtein distance between two strings.
   * @param a The first string.
   * @param b The second string.
   * @returns The Levenshtein distance.
   */
  getLevenshteinDistance(a: string, b: string): number {
    const an = a.length;
    const bn = b.length;

    if (an === 0) return bn;
    if (bn === 0) return an;

    const matrix: number[][] = [];

    // Initialize first row and column
    for (let i = 0; i <= an; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= bn; j++) {
      matrix[0][j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= an; i++) {
      for (let j = 1; j <= bn; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // Deletion
          matrix[i][j - 1] + 1,      // Insertion
          matrix[i - 1][j - 1] + cost // Substitution
        );
      }
    }

    return matrix[an][bn];
  },

  /**
   * Semantic scene intent parser using Gemini LLM (with rule-based fallback)
   */
  async analyzeSceneIntent(
    prompt: string, 
    apiKey: string | null | undefined,
    model: string = 'gemini-2.5-flash',
    options: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any, expectedResponseType?: 'image' | 'text' | 'json' } = {}
  ): Promise<SceneIntent> {
    const p = prompt.toLowerCase();
    const words = p.replace(/[.,!?]/g, '').split(/\s+/);
    
    const intent: SceneIntent = {
      furniture: [],
      propContext: [],
      mustInclude: [],
      summary: prompt.trim()
    };

    if (!prompt.trim()) return intent;

    // Use dummy apiKey if hosted mode is active
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : apiKey;

    if (effectiveKey) {
      try {
        const strictPrompt = `
Analyze this scene description for a background plate generator.
Description: "${prompt}"

Extract the following details if present:
- location: The specific physical place or setting. Do NOT return null if a place is implied. If it's a compound noun like 'theme park', extract 'theme park'. If it's vague, describe the setting context (e.g. 'sky', 'space', 'abstract void').
- action: The implied activity (e.g., sitting, flying, reading, standing).
- furniture: Any necessary support furniture (e.g., bench, table, chair, couch, desk).
- propContext: Any necessary props (e.g., coffee, book, laptop).
- mood: The atmospheric vibe (optional).
- recommendedCamera: Infer the best camera framing for this action (e.g., 'Close-Up', 'Medium Full', 'Wide Angle', 'Establishing Shot'). Choose Medium Full or Wide if standing/walking, Close-Up or Medium if sitting/details.
- recommendedLighting: Infer the most natural cinematic lighting style (e.g., 'Cinematic Dark', 'Natural Window', 'Overcast', 'Golden Hour').

Return ONLY valid JSON without markdown formatting. Exact schema:
{
  "location": "string",
  "action": "string",
  "furniture": ["array of strings"],
  "propContext": ["array of strings"],
  "mood": "string",
  "recommendedCamera": "string",
  "recommendedLighting": "string"
}
`;
        const parsed = await this.analyzeMultiFrameJson<any>(
          strictPrompt,
          effectiveKey,
          model,
          [],
          options
        );

        return {
          location: parsed.location || prompt.trim(), 
          action: parsed.action || undefined,
          furniture: Array.isArray(parsed.furniture) ? parsed.furniture : [],
          propContext: Array.isArray(parsed.propContext) ? parsed.propContext : [],
          mood: parsed.mood || undefined,
          recommendedCamera: parsed.recommendedCamera || undefined,
          recommendedLighting: parsed.recommendedLighting || undefined,
          mustInclude: [
            ...(parsed.location ? [parsed.location] : []),
            ...(parsed.action ? [parsed.action] : []),
            ...(Array.isArray(parsed.furniture) ? parsed.furniture : []),
            ...(Array.isArray(parsed.propContext) ? parsed.propContext : [])
          ],
          summary: prompt.trim()
        };
      } catch (e) {
        console.warn('LLM intent analysis failed, falling back to rule-based parser.', e);
      }
    }

    // Helper to check for exact or fuzzy match (allow 1 typo for words length > 3, 2 for > 5)
    // Also allows checking multi-word phrases exact match
    const hasMatch = (triggers: string[]) => {
        for (const t of triggers) {
            if (p.includes(t)) return true; // exact phrase match
            
            // fuzzy match single words
            if (!t.includes(' ')) {
                const maxDist = t.length > 5 ? 2 : (t.length > 3 ? 1 : 0);
                for (const w of words) {
                    if (Math.abs(w.length - t.length) <= maxDist) {
                        if (this.getLevenshteinDistance(w, t) <= maxDist) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };

    // Hard Locations (with common typos)
    const locations = [
      { id: 'cafe', triggers: ['cafe', 'cfe', 'caffe', 'coffee shop', 'coffeeshop'] },
      { id: 'office', triggers: ['office', 'ofice', 'offce'] },
      { id: 'bedroom', triggers: ['bedroom', 'bed room'] },
      { id: 'park', triggers: ['park'] },
      { id: 'room', triggers: ['room'] },
      { id: 'street', triggers: ['street'] },
      { id: 'alley', triggers: ['alley'] },
      { id: 'tavern', triggers: ['tavern', 'bar', 'pub'] },
      { id: 'dungeon', triggers: ['dungeon'] },
      { id: 'kitchen', triggers: ['kitchen'] },
      { id: 'studio', triggers: ['studio'] }
    ];
    for (const loc of locations) {
      if (hasMatch(loc.triggers)) {
        intent.location = loc.id;
        intent.mustInclude!.push(loc.id);
        break; // take first primary location
      }
    }

    // Hard Actions
    const actions = [
      { id: 'sitting', triggers: ['sitting', 'sit', 'seated', 'sited', 'siting'] },
      { id: 'standing', triggers: ['standing', 'stand'] },
      { id: 'leaning', triggers: ['leaning', 'lean'] },
      { id: 'waiting', triggers: ['waiting', 'wait'] },
      { id: 'reading', triggers: ['reading', 'read'] },
      { id: 'sleeping', triggers: ['sleeping', 'sleep', 'asleep'] },
      { id: 'drinking', triggers: ['drinking', 'drink'] },
      { id: 'walking', triggers: ['walking', 'walk'] },
      { id: 'running', triggers: ['running', 'run'] }
    ];
    for (const act of actions) {
      if (hasMatch(act.triggers)) {
        intent.action = act.id;
        intent.mustInclude!.push(act.id);
        break; 
      }
    }

    // Hard Furniture / Support Context
    const furnitureTokens = [
      { id: 'bench', triggers: ['bench'] },
      { id: 'table', triggers: ['table', 'tabel'] },
      { id: 'bed', triggers: ['bed'] },
      { id: 'couch', triggers: ['couch', 'sofa'] },
      { id: 'desk', triggers: ['desk'] },
      { id: 'chair', triggers: ['chair', 'seat', 'stool'] }
    ];
    for (const f of furnitureTokens) {
      if (hasMatch(f.triggers)) {
        intent.furniture!.push(f.id);
        intent.mustInclude!.push(f.id);
      }
    }

    // Hard Props
    const propTokens = [
      { id: 'coffee', triggers: ['coffee', 'cofee', 'caffee', 'latte', 'espresso'] },
      { id: 'book', triggers: ['book'] },
      { id: 'laptop', triggers: ['laptop', 'computer', 'macbook'] },
      { id: 'phone', triggers: ['phone', 'cellphone', 'mobile'] },
      { id: 'window', triggers: ['window'] },
      { id: 'mug', triggers: ['mug', 'cup', 'glass'] }
    ];
    // Deduplicate props if they overlap with location
    for (const pr of propTokens) {
      if (hasMatch(pr.triggers)) {
        if (!intent.propContext!.includes(pr.id)) {
            intent.propContext!.push(pr.id);
            intent.mustInclude!.push(pr.id);
        }
      }
    }

    return intent;
  },

  async generateText(prompt: string, apiKey: string, options: { billingMode?: 'hosted' | 'byok', entitlements?: any } = {}): Promise<string> {
    if (!apiKey && options.billingMode !== 'hosted') throw new Error("No API Key provided.");
    const effectiveKey = options.billingMode === 'hosted' ? 'HOSTED_MODE' : (apiKey || '');
    const useModel = 'gemini-2.5-flash';
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }]
    };

    if (options.billingMode === 'hosted') {
        const rawResultText = await GeminiService._executeHostedRequest(useModel, requestBody, { ...options, expectedResponseType: 'text' });
        if (rawResultText && rawResultText.startsWith('data:application/json')) {
            return decodeURIComponent(rawResultText.split(',')[1]);
        }
        return rawResultText;
    }

    const response = await fetch(`${baseUrl}?key=${effectiveKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
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

  async generateJson<T>(prompt: string, apiKey: string, options: { billingMode?: 'hosted' | 'byok', entitlements?: any } = {}): Promise<T> {
    const strictPrompt = `${prompt}\n\nCRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown formatting. No code fences. No commentary.`;

    let rawText = await this.generateText(strictPrompt, apiKey, options);

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
      rawText = await this.generateText(repairPrompt, apiKey, options);
      try {
        return tryParse(rawText);
      } catch (e2) {
        throw new Error("Gemini failed to return valid JSON even after repair.");
      }
    }
  },

  async generateVeoFivePartDraft(concept: string, apiKey: string, optionalContext?: string, options: { billingMode?: 'hosted' | 'byok', entitlements?: any } = {}): Promise<VeoFivePartDraft & { audio?: VeoAudioBlock, negativePrompt?: string }> {
    if (!apiKey && options.billingMode !== 'hosted') {
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

    return await this.generateJson<any>(prompt, apiKey, options);
  },

  /**
   * Layout-driven composite generator (Director Canvas Phase 2)
   */
  async generateCompositeFromLayout(args: {
    apiKey: string;
    model: string;
    aspectRatio?: string;
    imageSize?: '1K' | '2K' | '4K';
    backgroundUrl?: string;
    blueprintUrl?: string | null;
    protectionMaskUrl?: string | null;
    elements: Array<{
      id: string;
      url: string;
      label: string;
      type: 'actor' | 'prop';
      preserveIdentity?: boolean;
      preserveWardrobe?: boolean;
      groundingMode?: string;
      notes?: string;
    }>;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    instructions: string;
  }): Promise<string> {
    const { apiKey, model, aspectRatio, imageSize, backgroundUrl, blueprintUrl, protectionMaskUrl, elements, actorIdentitySets, instructions } = args;

    if (!apiKey) {
      console.warn("No API Key. Returning mock composite.");
      await new Promise(r => setTimeout(r, 1500));
      return `https://placehold.co/1024x576/1a1a1a/FFF?text=Mock+Composite:+${elements.length}+Elements`;
    }

    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const contentsParts: any[] = [];

    // 1. Text Instructions
    contentsParts.push({ text: instructions });

    // 2. Base Background
    if (backgroundUrl) {
      contentsParts.push({ text: `[BACKGROUND PLATE]` });
      const bg = await GeminiService._resolveImageData(backgroundUrl);
      contentsParts.push({ inlineData: { mimeType: bg.mimeType, data: bg.data } });
    }

    // 3. Layout Blueprint
    if (blueprintUrl) {
      contentsParts.push({ text: `[LAYOUT BLUEPRINT]` });
      const bp = await GeminiService._resolveImageData(blueprintUrl);
      contentsParts.push({ inlineData: { mimeType: bp.mimeType, data: bp.data } });
    }

    // 4. Elements in z-order
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el.url) continue;
      
      const identityText = el.preserveIdentity ? ' (PRESERVE IDENTITY)' : '';
      const wardrobeText = el.preserveWardrobe ? ' (PRESERVE WARDROBE)' : '';
      
      contentsParts.push({ text: `[ELEMENT ${i + 1}: ${el.label}] Type: ${el.type}${identityText}${wardrobeText}` });
      const elData = await GeminiService._resolveImageData(el.url);
      contentsParts.push({ inlineData: { mimeType: elData.mimeType, data: elData.data } });
    }

    // 5. Protection Mask
    if (protectionMaskUrl) {
      contentsParts.push({ text: `[PROTECTION MASK] (White = Editable, Black = Protected)` });
      const mask = await GeminiService._resolveImageData(protectionMaskUrl);
      contentsParts.push({ inlineData: { mimeType: mask.mimeType, data: mask.data } });
    }

    // 6. Actor References (Face Fidelity Identity Anchors)
    if (actorIdentitySets && actorIdentitySets.length > 0) {
      for (const set of actorIdentitySets) {
        if (!hasStrongFaceAnchor(set)) {
           console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'composite-from-layout' });
        }
        const orderedUrls = buildOrderedActorIdentityInputs(set);
        for (let i = 0; i < orderedUrls.length; i++) {
           const refData = await GeminiService._resolveImageData(orderedUrls[i]);
           contentsParts.push({ inlineData: { mimeType: refData.mimeType, data: refData.data } });
        }
      }
    }

    // Force strict structure behavior and Google grounding disabled for tight compositing
    const generationConfig: any = {
      responseModalities: ["IMAGE"],
      candidateCount: 1,
      imageConfig: {
        aspectRatio: aspectRatio || "16:9",
        ...(imageSize && { imageSize })
      },
       // High thinking helps Gemini organize strict layouts better
      thinkingConfig: GeminiService._buildThinkingConfigForModel(model, "high")
    };

    let response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: contentsParts }],
        generationConfig
      })
    });

    if (!response.ok) {
       let errText = await response.text();
       let cleanMsg = errText;
       try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}

       // Fallback without thinking config if model rejects it
       const thinkingRejected = response.status === 400 && /thinking level/i.test(cleanMsg) && generationConfig.thinkingConfig;
       
       if (thinkingRejected) {
         delete generationConfig.thinkingConfig;
         response = await fetch(`${baseUrl}?key=${apiKey}`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ contents: [{ parts: contentsParts }], generationConfig })
         });
         
         if (!response.ok) {
            errText = await response.text();
            cleanMsg = errText;
            try { cleanMsg = JSON.parse(errText).error?.message || cleanMsg; } catch {}
            throw new Error(`Composite Generation Error (Retry): ${cleanMsg}`);
         }
       } else {
         throw new Error(`Composite Generation Error: ${cleanMsg}`);
       }
    }

    const result = await response.json();
    const imgData = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    
    if (!imgData) throw new Error("No image returned from generation.");
    
    return `data:image/png;base64,${imgData}`;
  },

  /**
   * Generates a preview shot variation
   */
  async generateShotPreview(args: {
    anchorImageUrl: string;
    shotBlueprintUrl?: string;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    prompt: string;
    aspectRatio?: string;
    apiKey: string;
    model: string;
    sceneTruth?: import('../types/shots').SceneTruthSnapshot;
    presetId?: string;
    hasSubjectStyleAnalysis?: boolean;
    options?: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any, expectedResponseType?: 'image' | 'text' | 'json', signal?: AbortSignal };
  }): Promise<string> {
    const { anchorImageUrl, shotBlueprintUrl, actorIdentitySets = [], prompt, aspectRatio, apiKey, model, sceneTruth, presetId, hasSubjectStyleAnalysis } = args;
    
    if (sceneTruth) {
      console.log(`[GeminiService:generateShotPreview] Metadata Dump:`, {
         actorCount: sceneTruth.expectedActorCount,
         orderedActors: sceneTruth.actors.sort((a,b)=> a.leftToRightIndex - b.leftToRightIndex).map(a => a.actorLabel),
         presetId,
         cameraConstraints: sceneTruth.cameraConstraints,
         styleAnalysisDemoted: hasSubjectStyleAnalysis === false
      });
    }
    
    if (args.options?.billingMode !== 'hosted' && !apiKey) throw new Error("No API Key provided for shot generation");
    
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const parts: any[] = [];
    
    // 1. Primary scene anchor (MUST BE FIRST)
    const anchor = await GeminiService._resolveImageData(anchorImageUrl);
    parts.push({ text: `[AUTHORITATIVE SCENE AND LAYOUT ANCHOR]` });
    parts.push({ inlineData: { mimeType: anchor.mimeType, data: anchor.data } });
    parts.push({
      text:
        `[HARD ENVIRONMENT LOCK: Keep the exact same location, architecture, and environmental context from the anchor image. ` +
        `Do not relocate to a different setting. Do not switch indoor/outdoor. Do not change time-of-day/weather/era.]`
    });

    // 2. Camera Instruction Blueprint (MUST BE SECOND)
    if (shotBlueprintUrl) {
        const blueprint = await GeminiService._resolveImageData(shotBlueprintUrl);
        parts.push({ text: `[CAMERA INSTRUCTION BLUEPRINT: Adhere to the teal framing guide and occlusion overlays]` });
        parts.push({ inlineData: { mimeType: blueprint.mimeType, data: blueprint.data } });
    }
    
    // 3. Supplemental identity anchors (MUST BE THIRD)
    for (const set of actorIdentitySets) {
        if (!hasStrongFaceAnchor(set)) {
            console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'shots-preview' });
        }
        let orderedUrls = buildOrderedActorIdentityInputs(set);
        
        // Hard cap: aggressively limit actor references if hosted to avoid 502 oversized payload errors
        if (args.options?.billingMode === 'hosted') {
            orderedUrls = orderedUrls.slice(0, 1);
        }

        for (let i = 0; i < orderedUrls.length; i++) {
            const ref = await GeminiService._resolveImageData(orderedUrls[i]);
            parts.push({ text: `[ACTOR REFERENCE ${i + 1}]` });
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        }
    }
    
    // Shot Prompt
    parts.push({ text: prompt });
    
    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: aspectRatio || "16:9",
          imageSize: "1K" // preview quality
        }
      }
    };
    
    if (args.options?.billingMode === 'hosted') {
        const serialized = JSON.stringify(payload);
        console.log("[generateShotPreview] payload bytes =", new Blob([serialized]).size);

        const hostedArgs = { ...args.options };
        if (!hostedArgs.expectedResponseType) hostedArgs.expectedResponseType = 'image';
        return await GeminiService._executeHostedRequest(model, payload, hostedArgs);
    }
    
    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: args.options?.signal
    });
    
    if (!response.ok) {
      const err = await response.text();
      let cleanMsg = err;
      try { cleanMsg = JSON.parse(err).error?.message || cleanMsg; } catch {}
      throw new Error(`Shot Preview Generation Error: ${cleanMsg}`);
    }
    
    const result = await response.json();
    const data = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error("No image data in shot preview response.");
    
    return `data:image/png;base64,${data}`;
  },

  /**
   * Re-renders a selected shot variation at final quality (4K)
   */
  async rerenderShotFinal(args: {
    sourceResultUrl: string;
    selectedShotPreviewUrl: string;
    actorIdentitySets?: ActorIdentityReferenceSet[];
    prompt: string;
    aspectRatio?: string;
    apiKey: string;
    model: string;
    sceneTruth?: import('../types/shots').SceneTruthSnapshot;
    presetId?: string;
    options?: { billingMode?: 'hosted' | 'byok', entitlements?: any, onJobAccepted?: any, expectedResponseType?: 'image' | 'text' | 'json', signal?: AbortSignal };
  }): Promise<string> {
    const { sourceResultUrl, selectedShotPreviewUrl, actorIdentitySets = [], prompt, aspectRatio, apiKey, model, sceneTruth, presetId, options } = args;
    
    if (sceneTruth) {
      console.log(`[GeminiService:rerenderShotFinal] Metadata Dump:`, {
         actorCount: sceneTruth.expectedActorCount,
         orderedActors: sceneTruth.actors.sort((a,b)=> a.leftToRightIndex - b.leftToRightIndex).map(a => a.actorLabel),
         presetId,
         cameraConstraints: sceneTruth.cameraConstraints
      });
    }
    
    if (options?.billingMode !== 'hosted' && !apiKey) throw new Error("No API Key provided for shot generation");
    
    const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const parts: any[] = [];
    
    // 1. Supplemental identity anchors
    for (const set of actorIdentitySets) {
        if (!hasStrongFaceAnchor(set)) {
            console.warn(`[IdentityLock] Missing face anchor for generation request`, { actorId: set.actorId, path: 'shots-final' });
        }
        const orderedUrls = buildOrderedActorIdentityInputs(set);
        for (let i = 0; i < orderedUrls.length; i++) {
            const ref = await GeminiService._resolveImageData(orderedUrls[i]);
            parts.push({ text: `[ACTOR REFERENCE ${i + 1}]` });
            parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
        }
    }
    
    // 2. Primary framing anchor (the selected preview shot)
    const previewAnchor = await GeminiService._resolveImageData(selectedShotPreviewUrl);
    parts.push({ text: `[COMPOSITION ANCHOR - MATCH FRAMING AND PERSPECTIVE ONLY]` });
    parts.push({ inlineData: { mimeType: previewAnchor.mimeType, data: previewAnchor.data } });

    // 3. Supporting scene anchor (the original staged result)
    const sceneAnchor = await GeminiService._resolveImageData(sourceResultUrl);
    parts.push({ text: `[AUTHORITATIVE SCENE AND LAYOUT TRUTH ANCHOR - PRESERVE EXACT ROOM AND ACTOR COUNT]` });
    parts.push({ inlineData: { mimeType: sceneAnchor.mimeType, data: sceneAnchor.data } });
    parts.push({
      text:
        `[HARD ENVIRONMENT LOCK: Preserve the exact source environment from the staged anchor. ` +
        `No relocation, no indoor/outdoor conversion, no time-of-day/weather/era drift.]`
    });
    
    // Shot Prompt
    parts.push({ text: prompt });
    
    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        candidateCount: 1,
        imageConfig: {
          aspectRatio: aspectRatio || "16:9",
          imageSize: "4K" // final quality target
        }
      }
    };
    
    if (options?.billingMode === 'hosted') {
        const hostedArgs = { ...options };
        if (!hostedArgs.expectedResponseType) hostedArgs.expectedResponseType = 'image';
        return await GeminiService._executeHostedRequest(model, payload, hostedArgs);
    }
    
    const response = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: options?.signal
    });
    
    if (!response.ok) {
      const err = await response.text();
      let cleanMsg = err;
      try { cleanMsg = JSON.parse(err).error?.message || cleanMsg; } catch {}
      throw new Error(`Shot Final Rerender Error: ${cleanMsg}`);
    }
    
    const result = await response.json();
    const data = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
    if (!data) throw new Error("No image data in shot final response.");
    
    return `data:image/png;base64,${data}`;
  }

};

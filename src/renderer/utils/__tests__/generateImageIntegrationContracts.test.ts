import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('generate-image edge function CORS and validation contract', () => {
  const edgeSource = () => readFileSync('supabase/functions/generate-image/index.ts', 'utf8');

  it('handles OPTIONS before auth, JSON parsing, validation, or provider calls', () => {
    const source = edgeSource();
    const optionsIndex = source.indexOf("if (req.method === 'OPTIONS')");
    const authIndex = source.indexOf("req.headers.get('Authorization')");
    const jsonIndex = source.indexOf('readJsonBody(req)');

    expect(optionsIndex).toBeGreaterThan(-1);
    expect(optionsIndex).toBeLessThan(authIndex);
    expect(optionsIndex).toBeLessThan(jsonIndex);
    expect(source).toContain('return corsPreflightResponse(req);');
    expect(source).toContain("status: 204");
    expect(source).toContain("'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-idempotency-key'");
  });

  it('returns CORS-enabled JSON for invalid methods, invalid JSON, validation errors, success, and provider failures', () => {
    const source = edgeSource();

    expect(source).toContain("if (req.method !== 'POST')");
    expect(source).toContain("{ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }");
    expect(source).toContain("throw new HttpError(400, 'INVALID_JSON', 'Invalid JSON request body.')");
    expect(source).toContain("Missing required field: payload.model");
    expect(source).toContain("Missing required field: payload.requestBody");
    expect(source).toContain("Missing required field: executionFingerprint");
    expect(source).toContain('headers: { ...corsHeaders, \'Content-Type\': \'application/json\' }');
    expect(source).toContain("new GenerationExecutionError(\n        502,\n        'PROVIDER_ERROR'");
    expect(source).toContain('return new Response(JSON.stringify(errorBody), {');
    expect(source).toContain('headers: { ...corsHeaders, \'Content-Type\': \'application/json\' }');
  });
});

describe('generate-image frontend integration contract', () => {
  const serviceSource = () => readFileSync('src/renderer/services/GeminiService.ts', 'utf8');
  const sceneSource = () => readFileSync('src/renderer/components/SceneCanvas.tsx', 'utf8');

  it('uses supabase.functions.invoke with the expected payload and Supabase function error classes', () => {
    const source = serviceSource();

    expect(source).toContain("supabase.functions.invoke('generate-image'");
    expect(source).toContain('payload: payloadBodyForEdge');
    expect(source).toContain('executionFingerprint');
    expect(source).toContain("'X-Idempotency-Key': idempotencyKey");
    expect(source).toContain('FunctionsHttpError');
    expect(source).toContain('FunctionsRelayError');
    expect(source).toContain('FunctionsFetchError');
    expect(source).toContain('readHostedFunctionError(functionError)');
    expect(source).not.toContain('/functions/v1/generate-image`;\n    const rawResponse = await fetch');
  });

  it('guards one staging generate action to one in-flight request and avoids implicit form submission', () => {
    const source = sceneSource();

    expect(source).toContain('const stagingGenerationInFlightRef = useRef(false);');
    expect(source).toContain('if (stagingGenerationInFlightRef.current || state.isProcessing) return;');
    expect(source).toContain('stagingGenerationInFlightRef.current = true;');
    expect(source).toContain('stagingGenerationInFlightRef.current = false;');
    expect(source).toContain('type="button"');
  });
});

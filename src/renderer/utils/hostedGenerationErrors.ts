type HostedGenerationErrorBody = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
};

const GENERIC_HOSTED_ERROR = 'Generation request failed';

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const parseHostedGenerationErrorBody = (
  responseText: string
): HostedGenerationErrorBody | null => {
  try {
    const parsed = JSON.parse(responseText) as unknown;
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const fallbackMessageForCode = (code: string): string => {
  switch (code) {
    case 'HOSTED_SCHEMA_MIGRATION_REQUIRED':
      return 'Hosted generation database setup is incomplete. Apply supabase/workers/image-processor/database_setup.sql, then redeploy generate-image.';
    case 'MISSING_R2_CONFIG':
      return 'Hosted image storage is not configured. Set the R2 secrets, including R2_PUBLIC_URL, on the generate-image function.';
    case 'MISSING_GEMINI_API_KEY':
      return 'Hosted image generation is not configured. Set GEMINI_API_KEY on the generate-image function.';
    case 'HOSTED_FUNCTION_CONFIG_MISSING':
      return 'Hosted generation function credentials are missing. Verify Supabase function secrets.';
    case 'HOSTED_ORCHESTRATION_TIMEOUT':
      return 'Hosted generation timed out before completion. Retry once, then check generate-image function logs if it repeats.';
    case 'REFERENCE_DOWNLOAD_TIMEOUT':
    case 'REFERENCE_DOWNLOAD_FAILED':
      return 'Hosted generation could not download one of the uploaded reference images. Retry the render; if it repeats, reduce active references or use smaller reference images.';
    default:
      return '';
  }
};

export const formatHostedGenerationErrorResponse = (
  status: number,
  responseText: string
): string => {
  const parsed = parseHostedGenerationErrorBody(responseText);
  const code = readString(parsed?.code);
  const bodyMessage = readString(parsed?.error) || readString(parsed?.message);
  const fallbackMessage = code ? fallbackMessageForCode(code) : '';

  if (code === 'INTERNAL_ERROR' && (!bodyMessage || bodyMessage === GENERIC_HOSTED_ERROR)) {
    return 'Hosted Generation Error [INTERNAL_ERROR]: generate-image failed before the provider returned details. Verify Supabase function secrets and hosted generation database migrations, then check the generate-image logs for "Generate Image Orchestration Error".';
  }

  const message = bodyMessage || fallbackMessage || responseText || `HTTP ${status}`;
  const label = code || `HTTP_${status}`;
  return `Hosted Generation Error [${label}]: ${message}`;
};

export type AnalysisFailureDiagnostic = {
  operation: 'analyze';
  model: string;
  code: string;
  status: number | null;
};

/**
 * Builds a concise, privacy-safe diagnostic for a failed post-generation analysis call.
 * Includes only the operation, analysis model, error code, and HTTP status — never raw images,
 * base64, prompts, tokens, or secrets. Used to log analysis failures as "unavailable" rather than
 * letting the caller silently treat the output as having passed validation.
 */
export const describeAnalysisFailure = (error: unknown, model: string): AnalysisFailureDiagnostic => {
  const message = error instanceof Error ? error.message : String(error);
  const labelMatch = message.match(/\[([A-Z0-9_]+)\]/);
  const label = labelMatch?.[1] ?? '';
  const httpMatch = label.match(/^HTTP_?(\d+)$/);

  return {
    operation: 'analyze',
    model,
    code: httpMatch ? 'HTTP_ERROR' : (label || 'UNKNOWN'),
    status: httpMatch ? Number(httpMatch[1]) : null
  };
};

export const formatHostedGenerationThrownError = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const match = rawMessage.match(/^generate-image\s+(\d+):\s*([\s\S]+)$/i);

  if (!match) return rawMessage;

  return formatHostedGenerationErrorResponse(Number(match[1]), match[2]);
};

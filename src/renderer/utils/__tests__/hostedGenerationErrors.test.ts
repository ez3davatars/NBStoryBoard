import { describe, expect, it } from 'vitest';
import {
  formatHostedGenerationErrorResponse,
  formatHostedGenerationThrownError,
  parseHostedGenerationErrorBody
} from '../hostedGenerationErrors';

describe('hostedGenerationErrors', () => {
  it('parses hosted function JSON error bodies', () => {
    expect(parseHostedGenerationErrorBody('{"error":"Nope","code":"TEST"}')).toEqual({
      error: 'Nope',
      code: 'TEST'
    });
    expect(parseHostedGenerationErrorBody('not-json')).toBeNull();
  });

  it('turns generic internal hosted failures into an actionable setup message', () => {
    const formatted = formatHostedGenerationErrorResponse(
      500,
      '{"error":"Generation request failed","code":"INTERNAL_ERROR"}'
    );

    expect(formatted).toContain('Hosted Generation Error [INTERNAL_ERROR]');
    expect(formatted).toContain('Supabase function secrets');
    expect(formatted).toContain('database migrations');
  });

  it('preserves classified edge function messages', () => {
    const formatted = formatHostedGenerationErrorResponse(
      500,
      '{"error":"Hosted generation database setup is incomplete.","code":"HOSTED_SCHEMA_MIGRATION_REQUIRED"}'
    );

    expect(formatted).toBe(
      'Hosted Generation Error [HOSTED_SCHEMA_MIGRATION_REQUIRED]: Hosted generation database setup is incomplete.'
    );
  });

  it('falls back to reference download guidance when the body has no message', () => {
    const formatted = formatHostedGenerationErrorResponse(
      504,
      '{"code":"REFERENCE_DOWNLOAD_TIMEOUT"}'
    );

    expect(formatted).toContain('uploaded reference images');
    expect(formatted).toContain('smaller reference images');
  });

  it('formats legacy thrown generate-image errors', () => {
    const formatted = formatHostedGenerationThrownError(
      new Error('generate-image 500: {"error":"Generation request failed","code":"INTERNAL_ERROR"}')
    );

    expect(formatted).toContain('Hosted Generation Error [INTERNAL_ERROR]');
  });
});

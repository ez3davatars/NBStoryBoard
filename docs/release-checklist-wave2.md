# Wave 2 Release Checklist

Use this checklist before merging a launch candidate.

## Release Metadata

- [ ] Release owner assigned
- [ ] Target version set
- [ ] Branch identified (example: `feature/veo-prompt-studio`)
- [ ] Planned release date/time confirmed

## Preflight Configuration

### Renderer/Web Env

- [ ] `VITE_SUPABASE_URL` is set
- [ ] `VITE_SUPABASE_ANON_KEY` is set
- [ ] BYOK mode tested with valid API key in app settings
- [ ] Hosted mode tested with valid authenticated Supabase session

### Supabase Function Env (`generate-image`, `cleanup-expired-generations`)

- [ ] `SUPABASE_URL` is set
- [ ] `SUPABASE_ANON_KEY` is set (for generate path)
- [ ] `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is set
- [ ] `R2_ACCOUNT_ID` is set
- [ ] `R2_ACCESS_KEY_ID` is set
- [ ] `R2_SECRET_ACCESS_KEY` is set
- [ ] `R2_BUCKET_NAME` is set
- [ ] `CLEANUP_INVOCATION_SECRET` is set (cleanup function)

### Worker Env (`image-processor`, `cleanup-cron`)

- [ ] `SUPABASE_URL` is set
- [ ] `SUPABASE_SECRET_KEY` is set
- [ ] `GEMINI_API_KEY` is set (`image-processor`)
- [ ] `R2_ACCOUNT_ID` is set
- [ ] `R2_ACCESS_KEY_ID` is set
- [ ] `R2_SECRET_ACCESS_KEY` is set
- [ ] `R2_BUCKET_NAME` is set
- [ ] `R2_PUBLIC_URL` is set (`image-processor`)

## Automated Gates

- [ ] `npx eslint .` passes with no errors/warnings
- [ ] `npm run -s build` passes
- [ ] `npx vitest run src/renderer/promptEngine/__tests__/PromptBuilder.test.ts src/renderer/utils/__tests__/shotsPromptSanitization.test.ts` passes

## Manual Smoke: Critical Flows

### Scene Compose/Render

- [ ] Open staging canvas and load an anchor image
- [ ] Add at least 2 reference slots and map targets
- [ ] Run strict render once
- [ ] Result image appears and no runtime errors are logged
- [ ] Re-run with replace mode toggled and verify output changes

### Veo Prompt + Generation

- [ ] Open Veo prompt builder
- [ ] Build or auto-generate a 5-part prompt draft
- [ ] Confirm combined prompt text renders in dock output
- [ ] Trigger generation and verify status transitions (`queued` -> `generating` -> `done` or handled failure)

### Hosted/Worker Processing

- [ ] Submit one hosted generation request
- [ ] Confirm generation row is created/updated in Supabase
- [ ] Confirm worker processes job successfully
- [ ] Confirm final asset is uploaded to R2 and URL is persisted

## Data + Expiry Validation

- [ ] Run one cleanup pass and verify expired temporary assets are removed
- [ ] Confirm `generations` rows are marked `EXPIRED` when expected
- [ ] Confirm no non-expired assets are touched

## Observability + Failure Handling

- [ ] App displays actionable errors for auth, billing mode, and generation failures
- [ ] Edge/worker logs include enough context to debug failed jobs
- [ ] Retries do not duplicate successful final assets

## Launch Readiness Sign-off

- [ ] QA sign-off
- [ ] Engineering sign-off
- [ ] Product sign-off
- [ ] Rollback owner assigned
- [ ] Rollback command/steps documented in release notes

## Rollback Plan (Fill Before Release)

- [ ] Previous stable git SHA recorded
- [ ] Previous deployed function/worker version recorded
- [ ] Rollback verification checklist attached

## Final Go/No-Go

- [ ] Go approved
- [ ] Release announced
- [ ] Post-release monitoring window started

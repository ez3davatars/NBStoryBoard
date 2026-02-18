/**
 * ============================================================================
 * SPATIAL INTELLIGENCE V32.2: AUTHORITY MANIFEST
 * ============================================================================
 * 
 * 1. ANCHOR CONSTRAINTS (ABSOLUTE)
 *    Directorial constraints (Anchor Regions, Layer Locks) are the highest 
 *    authority. They define the intended semantic boundaries of the scene.
 * 
 * 2. USER TRANSFORM (ABSOLUTE)
 *    Direct Director interaction (Drag, Scale, Rotation) is absolute. 
 *    The system must never "correct" a user's manual placement.
 * 
 * 3. DERIVED DEPTH LAYERS (READ-ONLY)
 *    Depth categorization (Foreground, Midground, Background) is derived
 *    from geometric analysis (Score-based sorting). 
 *    CRITICAL: Derived layers must NEVER reposition actors. Authority flows 
 *    from Transform -> Layer, never Layer -> Transform.
 * 
 * 4. LIGHTING RULES
 *    Lighting interaction (Specular response, shadow direction) is derived
 *    from the spatial context.
 * 
 * 5. PROMPT COMPILATION
 *    The final assembly step. All spatial context is flattened into 
 *    directorial instructions for the generation engine.
 * 
 * ============================================================================
 */

/**
 * Authority states for system intelligence.
 * AUTHORITATIVE: Fully verified geometric integrity.
 * DEGRADED: Limited integrity, manual overrides active.
 * INVALID: Intelligence unavailable (processing or desynchronized).
 */
export type SpatialAuthorityStatus = 'AUTHORITATIVE' | 'DEGRADED' | 'INVALID';

/**
 * Placement authority defines who is responsible for the current position.
 * 'auto': System-resolved or initial auto-staging.
 * 'user': Direct Director interaction (drag).
 */
export type PlacementAuthority = 'auto' | 'user';

/**
 * Hard displacement limit for automated placement resolution.
 * Prevents the system from moving an actor more than 10% of its width radius,
 * ensuring the Director's original intent is preserved.
 */
export const MAX_PLACEMENT_DISPLACEMENT_PERCENT = 0.10;

/**
 * Approximate depth value (0-255) for a standard ground plane fallback.
 */
export const FALLBACK_GROUND_DEPTH = 180;

/**
 * Standard depth band radius (±12 points in 0-255 range) used for 
 * occlusion transparency and collision detection.
 */
export const DEPTH_BAND_RADIUS = 12;

/**
 * Hard displacement cap in pixels is calculated as:
 * placementRadius * MAX_PLACEMENT_DISPLACEMENT_PERCENT
 */

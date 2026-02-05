# Grounding Model

## Overview
Actors are positioned freely in screen space but grounded using depth-map–derived floor constraints.

## Definitions
- **Raw Depth**: Sampled depth value at actor’s foot position.
- **Ground Depth**: Median depth of the bottom 12% of the depth map.
- **Clamped Depth**: `clampDepthToGround(rawDepth, groundDepth)`.

## Rules
- Actors may exist at any depth farther than the ground.
- Actors may never be nearer than the ground.
- Foreground objects (tables, counters) occlude actors naturally.
- Depth is not updated during drag.
- Depth is synchronized only at rest or on generation.

## Conventions
- **White** = Near
- **Black** = Far
- `DEPTH_NEAR_IS_HIGH = true`

## Non-Goals
- No live depth recomputation during interaction
- No prompt-based depth compensation
- No screen-Y–only grounding

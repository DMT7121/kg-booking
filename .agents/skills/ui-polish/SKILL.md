---
name: ui-polish
description: >-
  Performs precise visual refinement and polishing (1-2px alignment, optical balance, typography rhythm, spacing tokens, colors, radii, elevation, micro-interactions 120-240ms, and component states) without altering architecture or business workflows. Triggered by /ui-polish or polish requests.
---

# Visual Refinement & Polish Specialist (/ui-polish)

## When to Use This Skill
Activate when the user runs `/ui-polish` or asks for visual touch-ups, micro-tuning, alignment fixes, or aesthetic refinements on an already functioning interface.

## Guidelines
- **Zero Architecture Changes**: Do not refactor file structures, API services, or state stores.
- **Sub-Pixel Precision**: Fix 1-2px misalignments, uneven padding, and baseline discrepancies.
- **Optical Balance**: Align icons visually with adjacent typography (compensating for optical center).
- **Component State Completeness**: Ensure buttons and inputs have polished hover, focus-visible, and active styles.
- **Micro-Interactions**: Apply smooth, snappy transitions (120-240ms using opacity/transform).
- **Reduced Motion**: Verify that `prefers-reduced-motion` suppresses all unnecessary transitions.

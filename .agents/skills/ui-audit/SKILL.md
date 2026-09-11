---
name: ui-audit
description: >-
  Scans codebase and UI for visual bugs, UX friction, layout issues, hierarchy problems, design inconsistency, accessibility (a11y), responsiveness, and performance bottlenecks. Outputs a prioritized P0/P1/P2/P3 report without modifying code. Triggered by /ui-audit or audit requests.
---

# UI & UX Comprehensive Audit Specialist (/ui-audit)

## When to Use This Skill
Activate when the user runs `/ui-audit` or asks to review, evaluate, or audit the UI/UX, layout, responsive behavior, or design consistency of an application.

## Audit Protocol
When this skill is activated, perform a read-only audit across 5 dimensions:
1. **Visual Hierarchy**: Examine primary focal points, CTA clarity, header weight, and color competition.
2. **Layout & Spacing**: Inspect spacing consistency against an 8pt/4pt grid, edge crowding, alignment, and container constraints.
3. **UX Friction**: Identify redundant clicks, repeated inputs, disruptive modals, confusing navigation, and delayed feedback.
4. **Visual Bugs**: Check for single-character orphan line wraps, clipping, horizontal overflow, layout shifts (CLS), and height discrepancies between inputs and buttons.
5. **Accessibility & Responsive Health**: Check color contrast ratios, focus rings, mobile thumb ergonomics, and dialog escape handling.

## Output Format
Present findings categorized into:
- **P0 — Critical**: Breaking bugs, layout collapse, data loss risks.
- **P1 — High**: Severe UX friction on primary operational flows.
- **P2 — Medium**: Visual inconsistencies, alignment issues, missing states.
- **P3 — Polish**: Micro visual improvements, typography rhythm, subtle hover polish.

*Do NOT modify source code during an audit unless explicitly instructed to proceed with fixes.*

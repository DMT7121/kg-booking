---
name: ui-upgrade
description: >-
  Executes an end-to-end UI and UX upgrade pipeline (Audit -> Design System -> UX Restructure -> Implementation -> Responsive -> A11y -> Visual Polish -> Regression Check) while strictly preserving all existing business logic. Triggered by /ui-upgrade or upgrade requests.
---

# Master UI & UX Upgrade Pipeline (/ui-upgrade)

## When to Use This Skill
Activate when the user runs `/ui-upgrade` or instructs you to thoroughly upgrade, modernize, or elevate an existing application's user interface and experience.

## The 8-Stage Upgrade Pipeline
1. **Audit & Discovery**: Identify all current UI flaws, tech stack constraints, and user workflows.
2. **Design System Standardization**: Consolidate design tokens (CSS variables) for typography, colors, spacing, and elevation.
3. **UX Restructuring**: Optimize information architecture, streamline forms, and clarify primary/secondary button hierarchy.
4. **Surgical Implementation**: Refactor UI components incrementally while keeping business logic, API calls, and data models 100% intact.
5. **Responsive Adaptation**: Ensure seamless rendering from mobile (320px-390px) to desktop (1440px+).
6. **Accessibility Hardening**: Add semantic elements, proper ARIA labels, focus states, and keyboard navigation.
7. **Visual & Micro-Interaction Polish**: Refine padding, sub-pixel alignments, and subtle transitions (120-240ms).
8. **Regression Verification**: Validate that all pre-existing features, routes, and workflows operate without error.

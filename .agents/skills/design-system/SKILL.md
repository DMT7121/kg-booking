---
name: design-system
description: >-
  Establishes, standardizes, or extends a semantic Design Token system (colors, typography, spacing scale 4-64px, radii, shadows) and component primitives with 9 interactive states and light/dark theme support. Triggered by /design-system or design token requests.
---

# Design System & Design Token Architect (/design-system)

## When to Use This Skill
Activate when the user runs `/design-system` or asks to build, organize, or standardize CSS variables, color palettes, spacing scales, or shared UI primitives.

## Design System Specifications
- **Semantic Tokens**: Define tokens for surfaces (`--bg-surface`), text (`--text-primary`, `--text-secondary`), borders (`--border-subtle`), and semantic intents (`--primary`, `--success`, `--warning`, `--danger`).
- **Spacing Scale**: Enforce a strict 4px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.
- **Component Primitives**: Create reusable, token-driven components: Button, Input, Select, Badge, Card, Dialog, Toast, Table.
- **Theme Support**: Implement true dark mode with semantic surface layers rather than naive color inversion.

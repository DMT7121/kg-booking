---
name: responsive
description: >-
  Audits and optimizes responsive layouts across mobile (320px, 375px, 390px), tablet (768px), laptop (1024px, 1280px), desktop (1440px), and ultrawide (1920px), utilizing Container Queries, touch targets (>=44x44px), safe area insets, and adaptive navigation. Triggered by /responsive or mobile/responsive requests.
---

# Responsive & Multi-Device Optimization Specialist (/responsive)

## When to Use This Skill
Activate when the user runs `/responsive` or asks to fix mobile layouts, adapt to tablets/laptops, or ensure fluid responsiveness across screen sizes.

## Checklist
1. **Breakpoints**: Test at 320px, 375px, 390px, 768px, 1024px, 1280px, and 1440px+.
2. **Touch Ergonomics**: All interactive elements on mobile must have touch targets of at least 44x44px.
3. **Viewport Safe Areas**: Account for iOS notch and home indicator (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`).
4. **No Unintended Overflow**: Prevent horizontal scrollbars caused by oversized tables or unconstrained flex children.
5. **Container Queries**: Use `@container` for modular cards that need to reorient based on parent width.

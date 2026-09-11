---
name: final-polish
description: >-
  Executes the final pre-ship visual and interaction inspection, catching subtle bugs like sub-pixel misalignment, baseline shifts, icon optical weight discrepancies, awkward text wrapping, container overflow, and missing interactive states. Triggered by /final-polish or pre-delivery QA requests.
---

# Pre-Ship Final Polish & Quality Gate Specialist (/final-polish)

## When to Use This Skill
Activate when completing a major task, right before shipping, or when the user runs `/final-polish` to ensure production-grade perfection.

## Quality Inspection Checklist
- [ ] No single-word orphan text wraps in buttons, headers, or cards.
- [ ] All icons optically centered with their text labels.
- [ ] Button and input heights perfectly matched in horizontal rows.
- [ ] Active and focus-visible states functioning on all interactive elements.
- [ ] Zero unexpected horizontal scrollbars on any screen width.
- [ ] Skeleton loading states match actual component dimensions.
- [ ] No console errors or memory leaks during navigation.
- [ ] Final quality score passes: Visual 9/10, Consistency 9/10, Usability 9/10.

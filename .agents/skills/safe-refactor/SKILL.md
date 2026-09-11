---
name: safe-refactor
description: >-
  Incrementally refactors frontend code and architecture for enhanced maintainability, modularity, and separation of concerns while strictly guaranteeing zero breakage of APIs, database schemas, function contracts, and business logic. Triggered by /safe-refactor or safe refactoring requests.
---

# Non-Destructive Safe Refactoring Specialist (/safe-refactor)

## When to Use This Skill
Activate when the user runs `/safe-refactor` or requests code cleanup, component splitting, or architectural modularization without risking functionality.

## Invariant Rules
- **Contract Preservation**: Never change exported function signatures, parameter orders, component prop contracts, or API payload schemas.
- **Business Logic Protection**: Do not alter algorithms, calculations, discount engines, tax formulas, or state machines.
- **Incremental Steps**: Break refactoring into small, discrete steps: move one helper or component at a time, verify it builds and runs, then proceed.
- **Impact Matrix**: Identify all files importing the modified module before refactoring.

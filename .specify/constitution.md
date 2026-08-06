# GitHub Spec Kit Constitution

## Project Governance & Architectural Rules

1. **Local-First AI & Rule Engine Priority:**
   - Always run deterministic rule extraction first (<10ms).
   - Use L1 Memory + L2 IndexedDB response caching for repeat inputs.

2. **Concurrent Data Operations:**
   - Execute dual-write database operations concurrently (`Promise.allSettled`).
   - Never run sequential await calls for independent cloud sync requests.

3. **User Experience & Data Integrity:**
   - Pre-fill booking forms automatically upon AI analysis completion.
   - Expand Set Menu and Combo Couple sub-dish lists inside item notes without cluttering UI.

4. **Testing & Build Verification:**
   - Ensure 100% test suite pass rate before committing code.
   - Run production build verification (`npm run build`).

# ClawBridge Localization Implementation Plan (i18n)

## Goal
Implement a robust localization system for ClawBridge Dashboard supporting English (default) and Chinese.

## Core Strategy
1. **Frontend-Driven i18n**: Since ClawBridge is a Single Page Application (SPA), we will implement a JSON-based translation dictionary on the client side.
2. **Language Detection**:
   - Priority 1: User-selected preference in `localStorage`.
   - Priority 2: Browser language (`navigator.language`).
   - Default: English (`en`).
3. **Internalization (i18n)**:
   - Create `public/js/i18n.js` to manage dictionary and switching logic.
   - Refactor `public/index.html` to use data attributes or placeholders for static text.
   - Refactor `public/js/dashboard.js` to use a global `t(key)` function instead of hardcoded strings.

## Implementation Steps

### Phase 1: Infrastructure (Completed)
- [x] Create `public/js/i18n.js` with `en` and `zh` dictionary.
- [x] Implement language detection and persistence logic.
- [x] Add language switcher to the Settings UI.

### Phase 2: Static Content (HTML) (Completed)
- [x] Add `data-i18n` attributes to all translatable elements in `public/index.html`.
- [x] Implement `applyTranslations()` to update DOM on load/switch.

### Phase 3: Dynamic Content (JS) (Completed)
- [x] Replace hardcoded strings in `public/js/dashboard.js` with `t()` function calls.
- [x] Translate:
    - Sidebar/Navigation labels.
    - Status/Health indicators.
    - Script/Process management text.
    - Token analytics and cost reporting labels.
    - Optimizer/Diagnostics help text and buttons.

### Phase 4: Backend/Config (Optional) (Completed)
- [x] Ensure backend error messages (if any) are either generic or translatable on the frontend.

## Verification
- Test automatic detection (change browser lang).
- Test manual switch via settings.
- Verify persistence after refresh.

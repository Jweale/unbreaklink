# UnbreakLink Project Plan

## 1. Foundation & Project Setup

### Task 1.1: Establish project scaffolding
- [x] Create MV3 manifest with required permissions (`scripting`, `storage`, `tabs`, `activeTab`).
- [x] Configure build tooling (e.g., Vite/Webpack) for content script, background service worker, popup, and options pages.
- [x] Set up TypeScript and linting/formatting rules consistent with Chrome extension best practices.
- [x] Integrate automated build/watch scripts and ensure Chrome extension reload workflow.

### Task 1.2: Implement shared utilities
- [ ] Define shared constants for actions, modifier keys, and storage keys.
- [ ] Create helper module for modifier detection and event normalization.
- [ ] Provide lightweight messaging wrapper between content scripts and service worker.

## 2. Core Interception Engine (Alpha milestone)

### Task 2.1: Implement click interception content script
- [ ] Inject listener at `document_start` with `useCapture: true` and passive safety checks.
- [ ] Detect anchor and clickable elements while respecting editable/ignored contexts.
- [ ] Normalize URLs (resolve relative links, handle data attributes).
- [ ] Forward validated events to background for tab/window handling.

### Task 2.2: Background service worker actions
- [ ] Handle requests to open background tabs (`chrome.tabs.create`) and new windows (`chrome.windows.create`).
- [ ] Maintain minimal runtime state and ensure wake-up reliability (alarms or resumable handlers).
- [ ] Log fix success metrics locally for future telemetry hook.

### Task 2.3: Global enable/disable controls
- [ ] Add synced storage flag for global enable state (default OFF).
- [ ] Provide safeguard to bypass interception when global state is disabled.
- [ ] Wire popup toggle to update and persist global state.

## 3. Per-Site Control (Beta milestone)

### Task 3.1: Site rule management
- [ ] Design storage schema for per-origin enablement preferences using `chrome.storage.sync`.
- [ ] Implement utilities to read/write site rules with debounce and error handling.
- [ ] Respect site rules inside content script gating logic.

### Task 3.2: Toolbar popup UI
- [ ] Build popup UI showing current site status and enable/disable toggle.
- [ ] Add call-to-action to request host permissions on first enable.
- [ ] Surface quick actions (open options, report issue) while maintaining minimal footprint.

### Task 3.3: Runtime permission flow
- [ ] Request `host_permissions` dynamically when toggling a site ON.
- [ ] Handle permission rejection gracefully and update UI state.
- [ ] Store granted origins and sync with site rules for consistency.

## 4. Custom Modifier Mapping (Beta milestone)

### Task 4.1: Options page architecture
- [ ] Build options page (React/Vue/vanilla) skeleton with routing for modifier settings and global preferences.
- [ ] Load and observe storage changes to keep UI and background in sync.

### Task 4.2: Modifier mapping editor
- [ ] Render editable mapping table for modifier combinations and actions.
- [ ] Validate combinations to prevent duplicates/conflicts.
- [ ] Persist mappings and push updates to content script via messaging.

### Task 4.3: Content script action dispatcher
- [ ] Consume user-defined mappings when interpreting click events.
- [ ] Provide fallback defaults when mappings are incomplete.
- [ ] Add telemetry hooks for misconfiguration warnings (future use).

## 5. Destination Preview Tooltip (v1.0 milestone)

### Task 5.1: Tooltip component
- [ ] Inject isolated tooltip element with scoped CSS to avoid site interference.
- [ ] Display cleaned destination URL on hover with small delay and accessible styling.
- [ ] Allow global toggle to disable preview entirely.

### Task 5.2: URL resolution improvements
- [ ] Strip tracking parameters and handle redirects when feasible without fetching remote scripts.
- [ ] Provide fallback to raw `href` when sanitization fails.
- [ ] Respect privacy expectations (no external requests without consent).

## 6. UX & Onboarding Enhancements

### Task 6.1: First-run experience
- [ ] Implement welcome page explaining problem statement and enabling workflow.
- [ ] Offer quick tutorial for toggling sites and customizing modifiers.
- [ ] Record completion state to avoid repeat display.

### Task 6.2: Trust & transparency elements
- [ ] Surface manifest info, privacy notice, and telemetry opt-in within options.
- [ ] Provide clear explanations of permissions requested per site.
- [ ] Ensure no remote code execution paths to maintain trust.

## 7. QA, Release, and Metrics

### Task 7.1: Testing strategy
- [ ] Set up unit tests for modifier logic and storage helpers.
- [ ] Add integration tests using puppeteer/webdriver for key user flows on sample sites.
- [ ] Establish manual regression checklist for major browsers/channels.

### Task 7.2: Telemetry & Metrics instrumentation
- [ ] Implement optional error reporting hook with user consent.
- [ ] Track “fix success” events without storing PII.
- [ ] Provide export/logging utilities for internal debugging.

### Task 7.3: Release packaging
- [ ] Automate build output (zip) with versioning and changelog template.
- [ ] Prepare Chrome Web Store listing assets (screenshots, copy) aligned with privacy messaging.
- [ ] Define staged rollout plan (Alpha → Beta → v1.0) and feedback loops.

## 1. Product overview
**Name (working):** UnbreakLink  
**Goal:** Restore and improve standard link-opening behaviour that websites break (Ctrl/⌘+click, Shift+click, middle-click), while giving users clear, per-site control and trust.  
**Target users:** Power web users (tech professionals, researchers, developers, privacy-minded) frustrated by sites hijacking clicks; want consistent, predictable new-tab/window behaviour.  
**Value prop:** “Unbreak broken links — reclaim and customise your click behaviour everywhere on the web.” (Domain secured: UnbreakLink.com)

---

## 2. Problem & motivation
- Many websites override native click modifiers (e.g. SPAs with `preventDefault`, analytics wrappers).
- Chrome MV3 killed many older “fixer” extensions; existing ones are abandoned or broken.
- Users want the *old defaults back* plus the ability to control when/where the fix applies.

---

## 3. Key user stories

| ID | User story |
|----|------------|
| U1 | As a user, I want **ctrl/⌘/middle click to open a link in a new background tab** even on sites that block it. |
| U2 | As a user, I want **Shift+click to open a new window** when sites override it. |
| U3 | As a user, I want to **enable/disable the fix on a per-site basis** so I don’t over-grant permissions. |
| U4 | As a user, I want to **remap modifiers** (e.g., Alt+click = background tab) to fit my workflow. |
| U5 | As a user, I want to **see the real destination URL** before opening (preview tooltip) for trust and safety. |

---

## 4. Feature set (MVP)

### 4.1 Core interception engine
- **Content script** injected at `document_start` with `useCapture: true` to beat site event handlers.
- Detect clicks + modifier keys on `<a>` or clickable elements.
- Restore native behaviour:
  - Ctrl/⌘/middle → `chrome.tabs.create({url, active:false})`
  - Shift → `chrome.windows.create({url})`
- Respect editable fields & ignored elements.

### 4.2 Per-site control
- **Toolbar popup**: toggle ON/OFF for current site.
- Persist site rules (`chrome.storage.sync`).
- Default: OFF globally; prompt to enable per site (lowers permission friction).

### 4.3 Custom modifier mapping
- Options UI: simple table to map keys → action (background tab, foreground tab, new window, none).
- Validate combos (no duplicates).

### 4.4 Destination preview
- Lightweight tooltip on hover showing resolved `href` (clean URL).
- Option to disable globally.

---

## 5. Non-goals (for MVP)
- No complex analytics dashboards.
- No deep ad/tracker blocking (stick to click restoration).
- No multi-profile sync beyond Chrome Sync.

---

## 6. Technical notes

- **Manifest:** `manifest_version:3`
  - `permissions`: "scripting", "storage", "tabs", "activeTab"
  - `host_permissions`: "<all_urls>" (requested at runtime when user enables a site)
- **Background:** service worker (`background.js`) — mainly to handle tab/window creation and storage.
- **Options / popup:** React/Vue or vanilla if simple; includes per-site toggles & mapping UI.
- **Preview:** small injected tooltip element (CSS isolated to avoid site styles).
- **Telemetry (opt-in):** simple error reporting; no tracking by default.

---

## 7. UX considerations
- **First-run:** welcome page → explains what broke and how to enable site by site.
- **Permissions:** request host access only when toggled for current site.
- **Trust:** no external code loading; show manifest info & privacy notice.

---

## 8. Release plan

| Stage | Deliverable |
|-------|-------------|
| Alpha | Core click fix + global toggle; internal testing on known JS-heavy sites |
| Beta  | Per-site toggle UI + basic modifier remapping |
| v1.0  | Destination preview tooltip; polished onboarding and options page |

---

## 9. Risks & mitigations
- **Service worker lifecycle**: use alarms or re-hydrate on click events to keep state minimal.
- **Permission fatigue**: per-site prompt avoids “<all_urls>” fear.
- **CSP conflicts**: inject only minimal CSS/HTML; avoid eval/remote scripts.

---

## 10. Metrics for success
- Active users / DAU
- “Fix success” events (clicks intercepted & opened correctly)
- Support requests about broken sites (low = good)
- Extension store rating ≥4.5


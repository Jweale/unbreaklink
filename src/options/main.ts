import './index.css';

import {
  ClickAction,
  MESSAGE_TYPES,
  STORAGE_KEYS,
  MODIFIER_KEYS,
  type ModifierKey
} from '../shared/constants';
import { sendMessage } from '../shared/messaging';
import {
  DEFAULT_MODIFIER_MAP,
  BUTTON_KEYS,
  normalizeModifierMap,
  parseModifierCombination,
  formatModifierCombination,
  isClickAction,
  type ModifierMap,
  type ButtonKey
} from '../shared/modifier';

type Route = 'global' | 'modifiers';

type ModifierRow = {
  id: string;
  modifiers: Record<ModifierKey, boolean>;
  button: ButtonKey;
  action: ClickAction;
  error: string | null;
};

type OptionsState = {
  globalEnabled: boolean;
  globalLoading: boolean;
  globalSaving: boolean;
  globalStatusMessage: string | null;
  previewEnabled: boolean;
  previewLoading: boolean;
  previewSaving: boolean;
  previewStatusMessage: string | null;
  modifierLoading: boolean;
  modifierSaving: boolean;
  modifierStatusMessage: string | null;
  modifierRows: ModifierRow[];
  modifierErrors: string[];
  modifierDirty: boolean;
  modifierBaseline: ModifierMap;
  onboardingLoading: boolean;
  onboardingSaving: boolean;
  onboardingVisible: boolean;
  onboardingCompleted: boolean;
  onboardingStep: number;
  onboardingStatusMessage: string | null;
};

const ACTION_LABELS: Record<ClickAction, string> = {
  [ClickAction.BackgroundTab]: 'Open in background tab',
  [ClickAction.ForegroundTab]: 'Open in new tab',
  [ClickAction.NewWindow]: 'Open in new window',
  [ClickAction.None]: 'Do nothing'
};

const BUTTON_LABELS: Record<ButtonKey, string> = {
  PRIMARY: 'Primary click',
  MIDDLE: 'Middle click',
  RIGHT: 'Right click'
};

const COMBINATION_LABELS: Record<string, string> = {
  ALT: 'Alt',
  CTRL: 'Ctrl',
  META: 'Command',
  SHIFT: 'Shift',
  PRIMARY: 'Primary click',
  MIDDLE: 'Middle click',
  RIGHT: 'Right click'
};

const ACTION_ORDER: readonly ClickAction[] = [
  ClickAction.BackgroundTab,
  ClickAction.ForegroundTab,
  ClickAction.NewWindow,
  ClickAction.None
];

const COMBINATION_CANDIDATES: readonly string[] = (() => {
  const combos: string[] = [];
  const modifierCount = MODIFIER_KEYS.length;
  const total = 1 << modifierCount;

  for (const button of BUTTON_KEYS) {
    for (let mask = 0; mask < total; mask += 1) {
      const modifiers = MODIFIER_KEYS.reduce<Record<ModifierKey, boolean>>((acc, key, index) => {
        acc[key] = Boolean(mask & (1 << index));
        return acc;
      }, {} as Record<ModifierKey, boolean>);
      combos.push(formatModifierCombination(modifiers, button));
    }
  }

  return combos;
})();

type OnboardingStep = {
  title: string;
  description: string;
  bulletPoints?: readonly string[];
  primaryLabel?: string;
  route?: Route;
};

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    title: 'Welcome to UnbreakLink',
    description:
      'UnbreakLink automatically removes tracking redirects so you land on the real destination faster.',
    bulletPoints: [
      'Keep context by opening cleaner links in new tabs without extra redirects.',
      'Control how links open with simple modifier shortcuts and per-site rules.'
    ],
    route: 'global'
  },
  {
    title: 'Enable fixes where you browse',
    description:
      'Use the global toggle here in Options to turn UnbreakLink on everywhere, then flip site access directly from the extension popup.',
    bulletPoints: [
      'Global toggle controls whether UnbreakLink intercepts supported links across tabs.',
      'Open the popup on any site to grant or revoke host permissions instantly.'
    ],
    route: 'global'
  },
  {
    title: 'Customize your modifier shortcuts',
    description:
      'Pick which key and mouse combinations trigger background tabs, new windows, or simple passthrough.',
    bulletPoints: [
      'Add or edit combinations in the Modifier mapping tab.',
      'Resolve duplicates before saving so each shortcut stays unique.',
      'Changes sync automatically across all Chrome profiles signed in with sync.'
    ],
    primaryLabel: 'Start using UnbreakLink',
    route: 'modifiers'
  }
];

const state: OptionsState = {
  globalEnabled: false,
  globalLoading: true,
  globalSaving: false,
  globalStatusMessage: null,
  previewEnabled: true,
  previewLoading: true,
  previewSaving: false,
  previewStatusMessage: null,
  modifierLoading: true,
  modifierSaving: false,
  modifierStatusMessage: null,
  modifierRows: [],
  modifierErrors: [],
  modifierDirty: false,
  modifierBaseline: { ...DEFAULT_MODIFIER_MAP },
  onboardingLoading: true,
  onboardingSaving: false,
  onboardingVisible: false,
  onboardingCompleted: false,
  onboardingStep: 0,
  onboardingStatusMessage: null
};

const createRowId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const cloneModifierFlags = (flags: Record<ModifierKey, boolean>): Record<ModifierKey, boolean> => {
  const copy: Record<ModifierKey, boolean> = {} as Record<ModifierKey, boolean>;
  for (const key of MODIFIER_KEYS) {
    copy[key] = Boolean(flags[key]);
  }
  return copy;
};

const createRowFromCombination = (combination: string, action: ClickAction): ModifierRow => {
  const parsed = parseModifierCombination(combination);
  return {
    id: createRowId(),
    modifiers: cloneModifierFlags(parsed.modifiers),
    button: parsed.button,
    action,
    error: null
  };
};

const rowsFromMap = (map: ModifierMap): ModifierRow[] =>
  Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([combination, action]) => createRowFromCombination(combination, action));

const rowsToModifierMap = (rows: ModifierRow[]): ModifierMap =>
  rows.reduce<ModifierMap>((acc, row) => {
    const key = formatModifierCombination(row.modifiers, row.button);
    acc[key] = row.action;
    return acc;
  }, {});

const describeCombination = (row: ModifierRow): string =>
  formatModifierCombination(row.modifiers, row.button)
    .split('+')
    .map((part) => COMBINATION_LABELS[part] ?? part)
    .join(' + ');

const areModifierMapsEqual = (a: ModifierMap, b: ModifierMap): boolean => {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (a[key] !== b[key]) {
      return false;
    }
  }
  return true;
};

const updateModifierValidation = () => {
  const buckets = new Map<string, ModifierRow[]>();
  const errors: string[] = [];

  for (const row of state.modifierRows) {
    row.error = null;

    if (!(BUTTON_KEYS as readonly string[]).includes(row.button)) {
      row.error = 'Select a mouse button.';
      if (!errors.includes('Each mapping must include a mouse button.')) {
        errors.push('Each mapping must include a mouse button.');
      }
      continue;
    }

    const key = formatModifierCombination(row.modifiers, row.button);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(row);
    } else {
      buckets.set(key, [row]);
    }
  }

  let hasDuplicate = false;
  for (const rows of buckets.values()) {
    if (rows.length > 1) {
      hasDuplicate = true;
      for (const row of rows) {
        row.error = 'Duplicate combination';
      }
    }
  }

  if (hasDuplicate && !errors.includes('Duplicate combinations must be resolved before saving.')) {
    errors.push('Duplicate combinations must be resolved before saving.');
  }

  state.modifierErrors = errors;
};

const syncModifierDirty = () => {
  const hasErrors = state.modifierRows.some((row) => row.error);
  const currentMap = rowsToModifierMap(state.modifierRows);
  state.modifierDirty = hasErrors || !areModifierMapsEqual(state.modifierBaseline, currentMap);
};

const root = document.querySelector<HTMLDivElement>('#options-root');

if (!root) {
  throw new Error('Options root element missing');
}

root.innerHTML = `
  <div class="min-h-screen bg-base-200">
    <header class="bg-base-100/80 border-b border-base-300/60 backdrop-blur">
      <div class="mx-auto flex max-w-4xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-1">
          <h1 class="text-3xl font-semibold text-neutral">UnbreakLink Options</h1>
          <p class="text-sm text-base-content/70">Configure your global preferences and modifier shortcuts.</p>
        </div>
        <a
          class="btn btn-secondary btn-sm"
          href="https://github.com/Jweale/unbreaklink/issues/new"
          target="_blank"
          rel="noreferrer"
        >Report issue</a>
      </div>
    </header>
    <main class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10">
      <nav class="tabs tabs-boxed w-full overflow-x-auto bg-base-100/70">
        <a class="tab flex-1 whitespace-nowrap" data-route-tab="global" href="#/global">Global preferences</a>
        <a class="tab flex-1 whitespace-nowrap" data-route-tab="modifiers" href="#/modifiers">Modifier mapping</a>
      </nav>
      <section data-route-section="global" class="hidden">
        <div class="card bg-base-100/90 shadow-lg">
          <div class="card-body gap-6">
            <div class="space-y-2">
              <h2 class="card-title text-2xl">Global preferences</h2>
              <p class="text-sm text-base-content/70">Decide whether UnbreakLink intercepts links across all sites.</p>
            </div>
            <div class="flex flex-col gap-4 rounded-xl border border-base-300/70 bg-base-200/60 p-5 md:flex-row md:items-center md:justify-between">
              <div class="space-y-1">
                <p class="font-medium">Global enablement</p>
                <p id="global-status" class="text-sm text-base-content/70">Loading global preference…</p>
              </div>
              <label class="flex items-center gap-3">
                <span id="global-badge" class="badge badge-outline badge-lg">Loading…</span>
                <input id="global-toggle" type="checkbox" class="toggle toggle-primary" />
              </label>
            </div>
            <div class="flex flex-col gap-4 rounded-xl border border-base-300/70 bg-base-200/60 p-5 md:flex-row md:items-center md:justify-between">
              <div class="space-y-1">
                <p class="font-medium">Destination preview tooltip</p>
                <p id="preview-status" class="text-sm text-base-content/70">Loading preview preference…</p>
              </div>
              <label class="flex items-center gap-3">
                <span id="preview-badge" class="badge badge-outline badge-lg">Loading…</span>
                <input id="preview-toggle" type="checkbox" class="toggle toggle-primary" />
              </label>
            </div>
            <div class="alert alert-info">
              <span>Changes sync automatically across all windows where UnbreakLink is active.</span>
            </div>
          </div>
        </div>
      </section>
      <section data-route-section="modifiers" class="hidden">
        <div class="card bg-base-100/90 shadow-lg">
          <div class="card-body gap-6">
            <div class="space-y-2">
              <h2 class="card-title text-2xl">Modifier mapping</h2>
              <p class="text-sm text-base-content/70">Adjust how modifier combinations map to link-handling actions.</p>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p id="modifier-status" class="text-sm text-base-content/70">Loading modifier mapping…</p>
              <div class="flex flex-wrap gap-2">
                <button id="modifier-add" type="button" class="btn btn-outline btn-sm">Add mapping</button>
                <button id="modifier-reset" type="button" class="btn btn-ghost btn-sm">Reset to defaults</button>
              </div>
            </div>
            <div class="overflow-x-auto rounded-xl border border-base-300/70 bg-base-200/40">
              <table class="table">
                <thead>
                  <tr class="text-base-content/70">
                    <th class="min-w-[220px]">Combination</th>
                    <th class="min-w-[180px]">Action</th>
                    <th class="w-20 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody id="modifier-table-body"></tbody>
              </table>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <p id="modifier-feedback" class="text-sm text-error hidden"></p>
              <button id="modifier-save" type="button" class="btn btn-primary btn-sm">Save changes</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
  <div id="onboarding-overlay" class="fixed inset-0 z-40 hidden">
    <div class="absolute inset-0 bg-base-300/60 backdrop-blur-sm"></div>
    <div class="relative flex h-full w-full items-center justify-center px-4">
      <div class="w-full max-w-2xl rounded-3xl border border-base-300/70 bg-base-100/95 p-8 shadow-2xl">
        <div class="flex flex-col gap-6">
          <div class="space-y-3">
            <p id="onboarding-progress" class="text-sm font-medium text-base-content/70"></p>
            <h2 id="onboarding-title" class="text-3xl font-semibold text-neutral"></h2>
            <p id="onboarding-description" class="text-base text-base-content/80"></p>
            <ul id="onboarding-points" class="list-disc space-y-2 pl-5 text-base text-base-content/80"></ul>
            <p id="onboarding-status" class="text-sm text-error hidden"></p>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <button id="onboarding-skip" type="button" class="btn btn-ghost btn-sm text-base-content/80">Skip</button>
            <div class="flex gap-2">
              <button id="onboarding-secondary" type="button" class="btn btn-outline btn-sm">Back</button>
              <button id="onboarding-primary" type="button" class="btn btn-primary btn-sm">Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

const globalToggle = root.querySelector<HTMLInputElement>('#global-toggle');
const globalStatus = root.querySelector<HTMLParagraphElement>('#global-status');
const globalBadge = root.querySelector<HTMLSpanElement>('#global-badge');
const previewToggle = root.querySelector<HTMLInputElement>('#preview-toggle');
const previewStatus = root.querySelector<HTMLParagraphElement>('#preview-status');
const previewBadge = root.querySelector<HTMLSpanElement>('#preview-badge');
const modifierStatus = root.querySelector<HTMLParagraphElement>('#modifier-status');
const modifierTableBody = root.querySelector<HTMLTableSectionElement>('#modifier-table-body');
const modifierFeedback = root.querySelector<HTMLParagraphElement>('#modifier-feedback');
const modifierAddButton = root.querySelector<HTMLButtonElement>('#modifier-add');
const modifierResetButton = root.querySelector<HTMLButtonElement>('#modifier-reset');
const modifierSaveButton = root.querySelector<HTMLButtonElement>('#modifier-save');
const tabLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-route-tab]'));
const routeSections = Array.from(root.querySelectorAll<HTMLElement>('[data-route-section]'));
const onboardingOverlay = root.querySelector<HTMLDivElement>('#onboarding-overlay');
const onboardingTitle = root.querySelector<HTMLHeadingElement>('#onboarding-title');
const onboardingDescription = root.querySelector<HTMLParagraphElement>('#onboarding-description');
const onboardingPoints = root.querySelector<HTMLUListElement>('#onboarding-points');
const onboardingProgress = root.querySelector<HTMLParagraphElement>('#onboarding-progress');
const onboardingStatus = root.querySelector<HTMLParagraphElement>('#onboarding-status');
const onboardingPrimary = root.querySelector<HTMLButtonElement>('#onboarding-primary');
const onboardingSecondary = root.querySelector<HTMLButtonElement>('#onboarding-secondary');
const onboardingSkip = root.querySelector<HTMLButtonElement>('#onboarding-skip');

let onboardingRouteApplied: Route | null = null;

if (
  !globalToggle ||
  !globalStatus ||
  !globalBadge ||
  !previewToggle ||
  !previewStatus ||
  !previewBadge ||
  !modifierStatus ||
  !modifierTableBody ||
  !modifierFeedback ||
  !modifierAddButton ||
  !modifierResetButton ||
  !modifierSaveButton ||
  !onboardingOverlay ||
  !onboardingTitle ||
  !onboardingDescription ||
  !onboardingPoints ||
  !onboardingProgress ||
  !onboardingStatus ||
  !onboardingPrimary ||
  !onboardingSecondary ||
  !onboardingSkip
) {
  throw new Error('Options markup failed to render');
}

const getRouteFromHash = (): Route => {
  const hash = window.location.hash.toLowerCase();
  if (hash === '#/modifiers') {
    return 'modifiers';
  }
  return 'global';
};

const applyRoute = (route: Route) => {
  for (const tab of tabLinks) {
    const tabRoute = tab.dataset.routeTab as Route | undefined;
    if (tabRoute === route) {
      tab.classList.add('tab-active');
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.classList.remove('tab-active');
      tab.removeAttribute('aria-current');
    }
  }

  for (const section of routeSections) {
    const sectionRoute = section.dataset.routeSection as Route | undefined;
    if (sectionRoute === route) {
      section.classList.remove('hidden');
    } else {
      section.classList.add('hidden');
    }
  }
};

const renderGlobal = () => {
  if (!globalToggle || !globalStatus || !globalBadge || !previewToggle || !previewStatus || !previewBadge) {
    return;
  }

  if (state.globalLoading) {
    globalToggle.checked = state.globalEnabled;
    globalToggle.disabled = true;
    globalBadge.textContent = 'Loading…';
    globalBadge.className = 'badge badge-outline badge-lg';
    globalStatus.textContent = 'Loading global preference…';
  } else if (state.globalSaving) {
    globalToggle.disabled = true;
    globalBadge.textContent = state.globalEnabled ? 'Enabled' : 'Disabled';
    globalBadge.className = state.globalEnabled
      ? 'badge badge-success badge-lg'
      : 'badge badge-outline badge-lg';
    globalStatus.textContent = 'Saving changes…';
  } else {
    globalToggle.disabled = false;
    globalToggle.checked = state.globalEnabled;
    if (state.globalEnabled) {
      globalBadge.textContent = 'Enabled';
      globalBadge.className = 'badge badge-success badge-lg';
    } else {
      globalBadge.textContent = 'Disabled';
      globalBadge.className = 'badge badge-outline badge-lg';
    }
    if (state.globalStatusMessage) {
      globalStatus.textContent = state.globalStatusMessage;
    } else if (state.globalEnabled) {
      globalStatus.textContent = 'UnbreakLink intercepts supported links across your browser.';
    } else {
      globalStatus.textContent = 'UnbreakLink is paused globally. Enable it to restore modifier shortcuts.';
    }
  }

  if (state.previewLoading) {
    previewToggle.checked = state.previewEnabled;
    previewToggle.disabled = true;
    previewBadge.textContent = 'Loading…';
    previewBadge.className = 'badge badge-outline badge-lg';
    previewStatus.textContent = 'Loading preview preference…';
  } else if (state.previewSaving) {
    previewToggle.disabled = true;
    previewToggle.checked = state.previewEnabled;
    previewBadge.textContent = state.previewEnabled ? 'Enabled' : 'Disabled';
    previewBadge.className = state.previewEnabled
      ? 'badge badge-success badge-lg'
      : 'badge badge-outline badge-lg';
    previewStatus.textContent = 'Saving changes…';
  } else {
    previewToggle.disabled = false;
    previewToggle.checked = state.previewEnabled;
    if (state.previewEnabled) {
      previewBadge.textContent = 'Enabled';
      previewBadge.className = 'badge badge-success badge-lg';
    } else {
      previewBadge.textContent = 'Disabled';
      previewBadge.className = 'badge badge-outline badge-lg';
    }
    if (state.previewStatusMessage) {
      previewStatus.textContent = state.previewStatusMessage;
    } else if (state.previewEnabled) {
      previewStatus.textContent = 'Show cleaned destination URLs when hovering supported links.';
    } else {
      previewStatus.textContent = 'Tooltip previews are disabled globally.';
    }
  }
};

const deriveModifierStatus = (): string => {
  if (state.modifierLoading) {
    return 'Loading modifier mapping…';
  }
  if (state.modifierSaving) {
    return 'Saving changes…';
  }
  if (state.modifierErrors.length) {
    return 'Resolve highlighted issues before saving.';
  }
  if (state.modifierStatusMessage) {
    return state.modifierStatusMessage;
  }
  if (state.modifierDirty) {
    return 'You have unsaved changes.';
  }
  return 'Synced with browser storage.';
};

const createModifierRowElement = (row: ModifierRow): HTMLTableRowElement => {
  const tableRow = document.createElement('tr');
  tableRow.dataset.rowId = row.id;
  tableRow.className = 'align-top';
  if (row.error) {
    tableRow.classList.add('bg-error/10');
  }

  const combinationCell = document.createElement('td');
  combinationCell.className = 'space-y-3';

  const modifiersWrapper = document.createElement('div');
  modifiersWrapper.className = 'flex flex-wrap gap-2';
  for (const modifierKey of MODIFIER_KEYS) {
    const label = document.createElement('label');
    label.className = 'label cursor-pointer gap-2 rounded-lg border border-transparent px-2 py-1 hover:border-base-300';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'checkbox checkbox-sm';
    checkbox.checked = row.modifiers[modifierKey];
    checkbox.dataset.rowId = row.id;
    checkbox.dataset.modifierKey = modifierKey;

    const caption = document.createElement('span');
    caption.className = 'label-text text-xs uppercase tracking-wide';
    caption.textContent = modifierKey.toUpperCase();

    label.append(checkbox, caption);
    modifiersWrapper.append(label);
  }

  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'flex flex-col gap-1';
  const buttonLabel = document.createElement('span');
  buttonLabel.className = 'text-xs text-base-content/60';
  buttonLabel.textContent = 'Mouse button';

  const buttonSelect = document.createElement('select');
  buttonSelect.className = 'select select-bordered select-sm max-w-xs';
  buttonSelect.dataset.rowId = row.id;
  buttonSelect.dataset.field = 'button';
  for (const buttonKey of BUTTON_KEYS) {
    const option = document.createElement('option');
    option.value = buttonKey;
    option.textContent = BUTTON_LABELS[buttonKey];
    buttonSelect.append(option);
  }
  buttonSelect.value = row.button;
  buttonWrapper.append(buttonLabel, buttonSelect);

  const summary = document.createElement('p');
  summary.className = 'text-xs text-base-content/60';
  summary.textContent = describeCombination(row);

  combinationCell.append(modifiersWrapper, buttonWrapper, summary);

  if (row.error) {
    const errorText = document.createElement('p');
    errorText.className = 'text-xs text-error';
    errorText.textContent = row.error;
    combinationCell.append(errorText);
  }

  const actionCell = document.createElement('td');
  const actionSelect = document.createElement('select');
  actionSelect.className = 'select select-bordered select-sm w-full max-w-xs';
  actionSelect.dataset.rowId = row.id;
  actionSelect.dataset.field = 'action';
  for (const actionKey of ACTION_ORDER) {
    const option = document.createElement('option');
    option.value = actionKey;
    option.textContent = ACTION_LABELS[actionKey];
    actionSelect.append(option);
  }
  actionSelect.value = row.action;
  actionCell.append(actionSelect);

  const removeCell = document.createElement('td');
  removeCell.className = 'text-center';
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'btn btn-ghost btn-xs text-error';
  removeButton.dataset.action = 'remove-row';
  removeButton.dataset.rowId = row.id;
  removeButton.textContent = 'Remove';
  removeCell.append(removeButton);

  tableRow.append(combinationCell, actionCell, removeCell);
  return tableRow;
};

const renderModifiers = () => {
  modifierStatus.textContent = deriveModifierStatus();

  modifierAddButton.disabled = state.modifierLoading || state.modifierSaving;
  modifierResetButton.disabled = state.modifierLoading || state.modifierSaving;
  modifierSaveButton.disabled =
    state.modifierLoading ||
    state.modifierSaving ||
    state.modifierRows.some((row) => row.error) ||
    !state.modifierDirty;
  modifierSaveButton.textContent = state.modifierSaving ? 'Saving…' : 'Save changes';

  if (state.modifierErrors.length) {
    modifierFeedback.textContent = state.modifierErrors.join(' ');
    modifierFeedback.classList.remove('hidden');
  } else {
    modifierFeedback.textContent = '';
    modifierFeedback.classList.add('hidden');
  }

  modifierTableBody.innerHTML = '';

  if (state.modifierLoading) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'py-6 text-center text-base-content/60';
    cell.textContent = 'Preparing shortcuts…';
    row.append(cell);
    modifierTableBody.append(row);
    return;
  }

  if (!state.modifierRows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'py-6 text-center text-base-content/60';
    cell.textContent = 'No modifier mappings defined yet.';
    row.append(cell);
    modifierTableBody.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const row of state.modifierRows) {
    fragment.append(createModifierRowElement(row));
  }
  modifierTableBody.append(fragment);
};

const renderOnboarding = () => {
  if (
    !onboardingOverlay ||
    !onboardingTitle ||
    !onboardingDescription ||
    !onboardingPoints ||
    !onboardingProgress ||
    !onboardingPrimary ||
    !onboardingSecondary ||
    !onboardingSkip ||
    !onboardingStatus
  ) {
    return;
  }

  if (state.onboardingLoading) {
    onboardingOverlay.classList.add('hidden');
    return;
  }

  const shouldShow = state.onboardingVisible && !state.onboardingCompleted;
  onboardingOverlay.classList.toggle('hidden', !shouldShow);

  if (!shouldShow) {
    onboardingStatus.textContent = '';
    onboardingStatus.classList.add('hidden');
    onboardingRouteApplied = null;
    return;
  }

  const totalSteps = ONBOARDING_STEPS.length;
  const maxIndex = totalSteps - 1;
  const clampedIndex = Math.min(Math.max(state.onboardingStep, 0), maxIndex);
  if (clampedIndex !== state.onboardingStep) {
    state.onboardingStep = clampedIndex;
  }

  const step = ONBOARDING_STEPS[clampedIndex] ?? ONBOARDING_STEPS[0];
  onboardingTitle.textContent = step.title;
  onboardingDescription.textContent = step.description;
  onboardingProgress.textContent = `Step ${clampedIndex + 1} of ${totalSteps}`;

  onboardingPoints.innerHTML = '';
  if (step.bulletPoints && step.bulletPoints.length) {
    onboardingPoints.classList.remove('hidden');
    for (const point of step.bulletPoints) {
      const item = document.createElement('li');
      item.textContent = point;
      onboardingPoints.append(item);
    }
  } else {
    onboardingPoints.classList.add('hidden');
  }

  if (state.onboardingStatusMessage) {
    onboardingStatus.textContent = state.onboardingStatusMessage;
    onboardingStatus.classList.remove('hidden');
  } else {
    onboardingStatus.textContent = '';
    onboardingStatus.classList.add('hidden');
  }

  const isFinal = clampedIndex === maxIndex;
  const saving = state.onboardingSaving;

  onboardingPrimary.textContent = saving
    ? isFinal
      ? 'Finishing…'
      : 'Working…'
    : step.primaryLabel ?? (isFinal ? 'Finish' : 'Next');
  onboardingPrimary.disabled = saving;

  onboardingSecondary.textContent = 'Back';
  onboardingSecondary.classList.toggle('hidden', clampedIndex === 0);
  onboardingSecondary.disabled = saving || clampedIndex === 0;

  onboardingSkip.classList.toggle('hidden', isFinal);
  onboardingSkip.disabled = saving;

  const route = step.route;
  if (route && onboardingRouteApplied !== route) {
    onboardingRouteApplied = route;
    const targetHash = `#/${route}`;
    if (window.location.hash.toLowerCase() !== targetHash) {
      window.location.hash = targetHash;
    }
    applyRoute(route);
  }
};

const loadGlobalEnabled = async () => {
  state.globalLoading = true;
  state.globalStatusMessage = null;
  renderGlobal();

  try {
    const response = await sendMessage<{ type: string }, { enabled: boolean }>({
      type: MESSAGE_TYPES.getGlobalEnabled
    });
    state.globalEnabled = Boolean(response.enabled);
  } catch (error) {
    state.globalStatusMessage = `Failed to load global preference: ${(error as Error).message}`;
  } finally {
    state.globalLoading = false;
    renderGlobal();
  }
};

const loadPreviewEnabled = async () => {
  state.previewLoading = true;
  state.previewStatusMessage = null;
  renderGlobal();

  try {
    const response = await sendMessage<{ type: string }, { enabled: boolean | undefined }>({
      type: MESSAGE_TYPES.getPreviewEnabled
    });
    state.previewEnabled = typeof response.enabled === 'boolean' ? response.enabled : true;
  } catch (error) {
    state.previewStatusMessage = `Failed to load preview preference: ${(error as Error).message}`;
  } finally {
    state.previewLoading = false;
    renderGlobal();
  }
};

const loadModifierMap = async () => {
  state.modifierLoading = true;
  renderModifiers();

  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.modifierMap);
    const normalized = normalizeModifierMap(stored[STORAGE_KEYS.modifierMap]);
    state.modifierBaseline = { ...normalized };
    state.modifierRows = rowsFromMap(normalized);
    state.modifierStatusMessage = 'Mappings synced from browser storage.';
  } catch (error) {
    state.modifierBaseline = { ...DEFAULT_MODIFIER_MAP };
    state.modifierRows = rowsFromMap(DEFAULT_MODIFIER_MAP);
    state.modifierStatusMessage = `Failed to load stored mapping: ${(error as Error).message}`;
  } finally {
    state.modifierLoading = false;
    updateModifierValidation();
    syncModifierDirty();
    renderModifiers();
  }
};

const loadOnboardingState = async () => {
  state.onboardingLoading = true;
  state.onboardingVisible = false;
  state.onboardingStatusMessage = null;
  renderOnboarding();

  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.onboardingComplete);
    const completed = Boolean(stored[STORAGE_KEYS.onboardingComplete]);
    state.onboardingCompleted = completed;
    state.onboardingVisible = !completed;
    state.onboardingStep = 0;
  } catch (error) {
    state.onboardingCompleted = false;
    state.onboardingVisible = true;
    state.onboardingStep = 0;
    state.onboardingStatusMessage = `Failed to load onboarding status: ${(error as Error).message}`;
  } finally {
    state.onboardingLoading = false;
    renderOnboarding();
  }
};

const completeOnboarding = async () => {
  if (state.onboardingSaving) {
    return;
  }

  state.onboardingSaving = true;
  state.onboardingStatusMessage = null;
  renderOnboarding();

  try {
    await chrome.storage.sync.set({ [STORAGE_KEYS.onboardingComplete]: true });
    state.onboardingCompleted = true;
    state.onboardingVisible = false;
  } catch (error) {
    state.onboardingStatusMessage = `Failed to record completion: ${(error as Error).message}`;
  } finally {
    state.onboardingSaving = false;
    renderOnboarding();
  }
};

const initialize = async () => {
  renderGlobal();
  renderModifiers();
  renderOnboarding();
  await Promise.all([
    loadGlobalEnabled(),
    loadPreviewEnabled(),
    loadModifierMap(),
    loadOnboardingState()
  ]);
};

onboardingPrimary.addEventListener('click', async () => {
  if (state.onboardingSaving) {
    return;
  }

  const isFinal = state.onboardingStep >= ONBOARDING_STEPS.length - 1;
  if (isFinal) {
    await completeOnboarding();
    return;
  }

  state.onboardingStep += 1;
  state.onboardingStatusMessage = null;
  renderOnboarding();
});

onboardingSecondary.addEventListener('click', () => {
  if (state.onboardingSaving || state.onboardingStep <= 0) {
    return;
  }

  state.onboardingStep -= 1;
  state.onboardingStatusMessage = null;
  renderOnboarding();
});

onboardingSkip.addEventListener('click', () => {
  if (state.onboardingSaving) {
    return;
  }

  void completeOnboarding();
});

globalToggle.addEventListener('change', async () => {
  const targetValue = globalToggle.checked;

  state.globalEnabled = targetValue;
  state.globalSaving = true;
  state.globalStatusMessage = null;
  renderGlobal();

  try {
    const response = await sendMessage<{ type: string; payload: boolean }, { enabled: boolean }>({
      type: MESSAGE_TYPES.setGlobalEnabled,
      payload: targetValue
    });
    state.globalEnabled = Boolean(response.enabled);
    state.globalStatusMessage = null;
  } catch (error) {
    state.globalStatusMessage = `Failed to update global preference: ${(error as Error).message}`;
    state.globalEnabled = !targetValue;
    globalToggle.checked = state.globalEnabled;
  } finally {
    state.globalSaving = false;
    renderGlobal();
  }
});

previewToggle.addEventListener('change', async () => {
  const targetValue = previewToggle.checked;

  state.previewEnabled = targetValue;
  state.previewSaving = true;
  state.previewStatusMessage = null;
  renderGlobal();

  try {
    const response = await sendMessage<{ type: string; payload: boolean }, { enabled: boolean | undefined }>({
      type: MESSAGE_TYPES.setPreviewEnabled,
      payload: targetValue
    });
    state.previewEnabled = typeof response.enabled === 'boolean' ? response.enabled : true;
    state.previewStatusMessage = null;
  } catch (error) {
    state.previewStatusMessage = `Failed to update preview preference: ${(error as Error).message}`;
    state.previewEnabled = !targetValue;
    previewToggle.checked = state.previewEnabled;
  } finally {
    state.previewSaving = false;
    renderGlobal();
  }
});

modifierAddButton.addEventListener('click', () => {
  if (state.modifierLoading || state.modifierSaving) {
    return;
  }

  const used = new Set(
    state.modifierRows.map((row) => formatModifierCombination(row.modifiers, row.button))
  );
  const available = COMBINATION_CANDIDATES.find((candidate) => !used.has(candidate));
  if (!available) {
    state.modifierStatusMessage = 'All modifier combinations are already assigned.';
    renderModifiers();
    return;
  }

  state.modifierRows.push(createRowFromCombination(available, ClickAction.BackgroundTab));
  state.modifierStatusMessage = 'Define the new combination and save changes.';
  updateModifierValidation();
  syncModifierDirty();
  renderModifiers();
});

modifierResetButton.addEventListener('click', () => {
  if (state.modifierLoading || state.modifierSaving) {
    return;
  }

  state.modifierRows = rowsFromMap(DEFAULT_MODIFIER_MAP);
  state.modifierStatusMessage = 'Reverted to defaults. Save to apply.';
  updateModifierValidation();
  syncModifierDirty();
  renderModifiers();
});

modifierSaveButton.addEventListener('click', async () => {
  if (
    state.modifierLoading ||
    state.modifierSaving ||
    state.modifierRows.some((row) => row.error) ||
    !state.modifierDirty
  ) {
    return;
  }

  state.modifierSaving = true;
  state.modifierStatusMessage = 'Saving changes…';
  renderModifiers();

  const mapToPersist = rowsToModifierMap(state.modifierRows);

  try {
    await chrome.storage.sync.set({ [STORAGE_KEYS.modifierMap]: mapToPersist });
    await sendMessage<{ type: string; payload: ModifierMap }, { ok: boolean }>({
      type: MESSAGE_TYPES.updateModifierMap,
      payload: mapToPersist
    });
    state.modifierBaseline = { ...mapToPersist };
    state.modifierStatusMessage = 'Mappings saved successfully.';
  } catch (error) {
    state.modifierStatusMessage = `Failed to save mapping: ${(error as Error).message}`;
  } finally {
    state.modifierSaving = false;
    updateModifierValidation();
    syncModifierDirty();
    renderModifiers();
  }
});

modifierTableBody.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  const rowId = target.dataset.rowId;
  if (!rowId) {
    return;
  }

  const row = state.modifierRows.find((entry) => entry.id === rowId);
  if (!row) {
    return;
  }

  if (target instanceof HTMLInputElement && target.type === 'checkbox') {
    const modifierKey = target.dataset.modifierKey as ModifierKey | undefined;
    if (!modifierKey) {
      return;
    }
    row.modifiers[modifierKey] = target.checked;
  } else if (target instanceof HTMLSelectElement) {
    const field = target.dataset.field;
    if (field === 'button' && (BUTTON_KEYS as readonly string[]).includes(target.value)) {
      row.button = target.value as ButtonKey;
    } else if (field === 'action' && isClickAction(target.value)) {
      row.action = target.value;
    } else {
      return;
    }
  }

  state.modifierStatusMessage = null;
  updateModifierValidation();
  syncModifierDirty();
  renderModifiers();
});

modifierTableBody.addEventListener('click', (event) => {
  const button = (event.target instanceof HTMLButtonElement
    ? event.target
    : (event.target as HTMLElement).closest('button')) as HTMLButtonElement | null;
  if (!button || button.dataset.action !== 'remove-row') {
    return;
  }

  event.preventDefault();
  const rowId = button.dataset.rowId;
  if (!rowId) {
    return;
  }

  const nextRows = state.modifierRows.filter((row) => row.id !== rowId);
  if (nextRows.length === state.modifierRows.length) {
    return;
  }

  state.modifierRows = nextRows;
  state.modifierStatusMessage = 'Mapping removed. Save changes to apply.';
  updateModifierValidation();
  syncModifierDirty();
  renderModifiers();
});

window.addEventListener('hashchange', () => {
  const route = getRouteFromHash();
  applyRoute(route);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }

  if (STORAGE_KEYS.globalEnabled in changes) {
    const entry = changes[STORAGE_KEYS.globalEnabled];
    if (typeof entry.newValue === 'boolean') {
      state.globalEnabled = entry.newValue;
      state.globalStatusMessage = null;
      renderGlobal();
    }
  }

  if (STORAGE_KEYS.modifierMap in changes) {
    if (state.modifierSaving) {
      return;
    }

    const entry = changes[STORAGE_KEYS.modifierMap];
    const normalized = normalizeModifierMap(entry.newValue);

    if (state.modifierDirty) {
      state.modifierStatusMessage = 'Mappings changed in another context. Reset to discard your edits.';
      renderModifiers();
      return;
    }

    state.modifierBaseline = { ...normalized };
    state.modifierRows = rowsFromMap(normalized);
    state.modifierStatusMessage = 'Mappings refreshed from another context.';
    updateModifierValidation();
    syncModifierDirty();
    renderModifiers();
  }

  if (STORAGE_KEYS.onboardingComplete in changes) {
    const entry = changes[STORAGE_KEYS.onboardingComplete];
    state.onboardingCompleted = Boolean(entry.newValue);
    state.onboardingVisible = !state.onboardingCompleted;
    state.onboardingSaving = false;
    state.onboardingStatusMessage = null;
    state.onboardingStep = 0;
    renderOnboarding();
  }
});

const initialRoute = getRouteFromHash();
if (!window.location.hash) {
  window.location.replace('#/global');
  applyRoute('global');
} else {
  applyRoute(initialRoute);
}

void initialize();

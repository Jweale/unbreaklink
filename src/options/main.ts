import './index.css';

import { ClickAction, MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';
import { sendMessage } from '../shared/messaging';
import { DEFAULT_MODIFIER_MAP, type ModifierMap } from '../shared/modifier';

type Route = 'global' | 'modifiers';

type OptionsState = {
  globalEnabled: boolean;
  globalLoading: boolean;
  globalSaving: boolean;
  globalStatusMessage: string | null;
  modifierMap: ModifierMap;
  modifierLoading: boolean;
  modifierStatusMessage: string | null;
};

const ACTION_LABELS: Record<ClickAction, string> = {
  [ClickAction.BackgroundTab]: 'Open in background tab',
  [ClickAction.ForegroundTab]: 'Open in new tab',
  [ClickAction.NewWindow]: 'Open in new window',
  [ClickAction.None]: 'Do nothing'
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

const state: OptionsState = {
  globalEnabled: false,
  globalLoading: true,
  globalSaving: false,
  globalStatusMessage: null,
  modifierMap: { ...DEFAULT_MODIFIER_MAP },
  modifierLoading: true,
  modifierStatusMessage: null
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
              <p class="text-sm text-base-content/70">Review the current modifier shortcuts. Editing arrives in the next milestone.</p>
            </div>
            <p id="modifier-status" class="text-sm text-base-content/70">Loading modifier mapping…</p>
            <div class="overflow-x-auto rounded-xl border border-base-300/70 bg-base-200/40">
              <table class="table">
                <thead>
                  <tr class="text-base-content/70">
                    <th class="w-48">Combination</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="modifier-table-body"></tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
`;

const globalToggle = root.querySelector<HTMLInputElement>('#global-toggle');
const globalStatus = root.querySelector<HTMLParagraphElement>('#global-status');
const globalBadge = root.querySelector<HTMLSpanElement>('#global-badge');
const modifierStatus = root.querySelector<HTMLParagraphElement>('#modifier-status');
const modifierTableBody = root.querySelector<HTMLTableSectionElement>('#modifier-table-body');
const tabLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-route-tab]'));
const routeSections = Array.from(root.querySelectorAll<HTMLElement>('[data-route-section]'));

if (!globalToggle || !globalStatus || !globalBadge || !modifierStatus || !modifierTableBody) {
  throw new Error('Options markup failed to render');
}

const isClickAction = (value: unknown): value is ClickAction =>
  Object.values(ClickAction).includes(value as ClickAction);

const normalizeModifierMap = (value: unknown): ModifierMap => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_MODIFIER_MAP };
  }

  const entries = Object.entries(value as Record<string, unknown>).reduce<ModifierMap>((acc, [key, mapped]) => {
    if (typeof key === 'string' && isClickAction(mapped)) {
      acc[key] = mapped;
    }
    return acc;
  }, {});

  if (!Object.keys(entries).length) {
    return { ...DEFAULT_MODIFIER_MAP };
  }

  return entries;
};

const formatCombination = (combo: string): string => {
  const parts = combo.split('+');
  if (!parts.length) {
    return combo;
  }
  return parts
    .map((part) => COMBINATION_LABELS[part] ?? part)
    .join(' + ');
};

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
  if (!globalToggle || !globalStatus || !globalBadge) {
    return;
  }

  if (state.globalLoading) {
    globalToggle.checked = state.globalEnabled;
    globalToggle.disabled = true;
    globalBadge.textContent = 'Loading…';
    globalBadge.className = 'badge badge-outline badge-lg';
    globalStatus.textContent = 'Loading global preference…';
    return;
  }

  if (state.globalSaving) {
    globalToggle.disabled = true;
    globalBadge.textContent = state.globalEnabled ? 'Enabled' : 'Disabled';
    globalBadge.className = state.globalEnabled
      ? 'badge badge-success badge-lg'
      : 'badge badge-outline badge-lg';
    globalStatus.textContent = 'Saving changes…';
    return;
  }

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
};

const renderModifiers = () => {
  modifierTableBody.innerHTML = '';

  if (state.modifierLoading) {
    modifierStatus.textContent = 'Loading modifier mapping…';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.className = 'py-6 text-center text-base-content/60';
    cell.textContent = 'Preparing shortcuts…';
    row.append(cell);
    modifierTableBody.append(row);
    return;
  }

  const entries = Object.entries(state.modifierMap).sort(([a], [b]) => a.localeCompare(b));

  if (!entries.length) {
    modifierStatus.textContent = state.modifierStatusMessage ?? 'No custom mappings stored yet.';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.className = 'py-6 text-center text-base-content/60';
    cell.textContent = 'Modifier mapping will appear here once configured.';
    row.append(cell);
    modifierTableBody.append(row);
    return;
  }

  modifierStatus.textContent = state.modifierStatusMessage ?? 'Synced with browser storage.';

  for (const [combination, action] of entries) {
    const row = document.createElement('tr');
    const comboCell = document.createElement('td');
    comboCell.className = 'font-medium';
    comboCell.textContent = formatCombination(combination);

    const actionCell = document.createElement('td');
    actionCell.textContent = ACTION_LABELS[action] ?? action;

    row.append(comboCell, actionCell);
    modifierTableBody.append(row);
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

const loadModifierMap = async () => {
  state.modifierLoading = true;
  state.modifierStatusMessage = null;
  renderModifiers();

  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.modifierMap);
    state.modifierMap = normalizeModifierMap(stored[STORAGE_KEYS.modifierMap]);
    state.modifierStatusMessage = 'Mappings synced from browser storage.';
  } catch (error) {
    state.modifierMap = { ...DEFAULT_MODIFIER_MAP };
    state.modifierStatusMessage = `Failed to load stored mapping: ${(error as Error).message}`;
  } finally {
    state.modifierLoading = false;
    renderModifiers();
  }
};

const initialize = async () => {
  renderGlobal();
  renderModifiers();
  await Promise.all([loadGlobalEnabled(), loadModifierMap()]);
};

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
    const entry = changes[STORAGE_KEYS.modifierMap];
    state.modifierMap = normalizeModifierMap(entry.newValue);
    state.modifierStatusMessage = 'Mappings updated in another context.';
    renderModifiers();
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

import { ClickAction, MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';
import { sendMessage } from '../shared/messaging';
import {
  getModifierState,
  isValidClickTarget,
  shouldBypassInterception,
  DEFAULT_MODIFIER_MAP,
  normalizeModifierMap,
  formatModifierKey,
  type ModifierMap,
  type ModifierState
} from '../shared/modifier';
import { reportModifierFallback } from '../shared/telemetry';

const deriveTargetElement = (event: MouseEvent): Element | null => {
  const target = event.target as Element | null;
  if (!target) {
    return null;
  }
  return target.closest('a, [data-unbreaklink-clickable="true"]');
};

const resolveUrl = (element: Element | null): string | null => {
  if (!element) {
    return null;
  }

  const anchor = element.closest('a');
  if (anchor) {
    const href = anchor.getAttribute('href');
    if (href && !href.startsWith('javascript:')) {
      try {
        return new URL(href, document.baseURI).toString();
      } catch {
        // fall through to dataset checks
      }
    }

    const candidates = [
      anchor.getAttribute('data-href'),
      anchor.getAttribute('data-url'),
      anchor.getAttribute('data-target-url'),
      anchor.getAttribute('data-unbreaklink-url')
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      try {
        return new URL(candidate, document.baseURI).toString();
      } catch {
        continue;
      }
    }
  }

  const dataTarget = element.getAttribute('data-href') ?? element.getAttribute('data-url');
  if (dataTarget) {
    try {
      return new URL(dataTarget, document.baseURI).toString();
    } catch {
      return null;
    }
  }

  return null;
};

let globalEnabled = false;
let siteEnabled = false;
let trackedOrigin = window.location.origin;
let modifierMap: ModifierMap = { ...DEFAULT_MODIFIER_MAP };


const determineAction = (state: ModifierState): ClickAction => {
  if (state.button === 1) {
    return ClickAction.BackgroundTab;
  }

  if (state.shift && state.button === 0) {
    return ClickAction.NewWindow;
  }

  const combination = formatModifierKey(state);

  if (combination in modifierMap) {
    return modifierMap[combination];
  }

  if (combination in DEFAULT_MODIFIER_MAP) {
    const fallbackAction = DEFAULT_MODIFIER_MAP[combination];
    reportModifierFallback({ combination, resolvedAction: fallbackAction, reason: 'missing' });
    return fallbackAction;
  }

  reportModifierFallback({ combination, resolvedAction: ClickAction.None, reason: 'unassigned' });
  return ClickAction.None;
};

const interceptEvent = async (event: MouseEvent) => {
  if (!globalEnabled || !siteEnabled) {
    return;
  }

  if (shouldBypassInterception(event)) {
    return;
  }

  const targetElement = deriveTargetElement(event);
  if (!targetElement || !isValidClickTarget(event)) {
    return;
  }

  const url = resolveUrl(targetElement);
  if (!url) {
    return;
  }

  const modifierState = getModifierState(event);
  const action = determineAction(modifierState);
  if (action === ClickAction.None) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  void sendMessage({
    type: MESSAGE_TYPES.executeClickAction,
    payload: {
      url,
      action
    }
  }).catch((error: Error) => {
    console.warn('UnbreakLink failed to forward click action', error);
  });
};

const listenerOptions: AddEventListenerOptions = {
  capture: true,
  passive: false
};

const eventHandler = (event: Event) => {
  void interceptEvent(event as MouseEvent);
};

const events: Array<keyof WindowEventMap> = ['click', 'auxclick'];
for (const eventType of events) {
  window.addEventListener(eventType, eventHandler, listenerOptions);
}

const loadModifierMap = async () => {
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.modifierMap);
    modifierMap = normalizeModifierMap(stored[STORAGE_KEYS.modifierMap]);
  } catch (error) {
    console.warn('UnbreakLink failed to obtain modifier mapping', error);
    modifierMap = { ...DEFAULT_MODIFIER_MAP };
  }
};

const initialize = async () => {
  try {
    const response = await sendMessage<{ type: string }, { enabled: boolean }>({
      type: MESSAGE_TYPES.getGlobalEnabled
    });
    globalEnabled = response.enabled;
  } catch (error) {
    console.warn('UnbreakLink failed to obtain global enabled state', error);
    globalEnabled = false;
  }

  try {
    const response = await sendMessage<{ type: string; payload: string }, { origin: string; enabled: boolean }>({
      type: MESSAGE_TYPES.getSiteRule,
      payload: trackedOrigin
    });
    trackedOrigin = response.origin || trackedOrigin;
    siteEnabled = Boolean(response.enabled);
  } catch (error) {
    console.warn('UnbreakLink failed to obtain site rule state', error);
    siteEnabled = false;
  }

  await loadModifierMap();
};

const handleGlobalToggle = (message: unknown) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }
  const typed = message as { type?: string; payload?: { enabled?: boolean } };
  if (typed.type !== MESSAGE_TYPES.setGlobalEnabled) {
    return;
  }
  const enabled = typed.payload?.enabled;
  if (typeof enabled === 'boolean') {
    globalEnabled = enabled;
  }
};

const handleSiteRuleUpdate = (message: unknown) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }
  const typed = message as { type?: string; payload?: { origin?: string; enabled?: boolean } };
  if (typed.type !== MESSAGE_TYPES.siteRuleUpdated) {
    return;
  }
  const origin = typed.payload?.origin;
  if (!origin || origin !== trackedOrigin) {
    return;
  }
  if (typeof typed.payload?.enabled === 'boolean') {
    siteEnabled = typed.payload.enabled;
  }
};

const handleModifierMapUpdate = (message: unknown) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }
  const typed = message as { type?: string; payload?: unknown };
  if (typed.type !== MESSAGE_TYPES.updateModifierMap) {
    return;
  }
  modifierMap = normalizeModifierMap(typed.payload);
};

chrome.runtime.onMessage.addListener((message) => {
  handleGlobalToggle(message);
  handleSiteRuleUpdate(message);
  handleModifierMapUpdate(message);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }
  if (STORAGE_KEYS.modifierMap in changes) {
    const entry = changes[STORAGE_KEYS.modifierMap];
    modifierMap = normalizeModifierMap(entry.newValue);
  }
});

void initialize();

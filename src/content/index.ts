import { DestinationPreviewTooltip } from './tooltip';
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

type PreviewPointer = {
  x: number;
  y: number;
};

const derivePreviewElement = (target: EventTarget | null): Element | null => {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest('a, [data-unbreaklink-clickable="true"]');
};

const formatPreviewLabel = (input: string): string => {
  try {
    const parsed = new URL(input);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    const tail = `${path}${parsed.search}${parsed.hash}`;
    let decodedTail = tail;
    try {
      decodedTail = decodeURI(tail);
    } catch {
      // no-op if decoding fails
    }
    const formatted = `${parsed.hostname}${decodedTail}` || parsed.href;
    return formatted.length > 512 ? `${formatted.slice(0, 509)}…` : formatted;
  } catch {
    return input;
  }
};

const PREVIEW_HOVER_DELAY = 180;

let globalEnabled = false;
let siteEnabled = false;
let previewEnabled = true;
let trackedOrigin = window.location.origin;
let modifierMap: ModifierMap = { ...DEFAULT_MODIFIER_MAP };

const tooltip = new DestinationPreviewTooltip();

let hoverTimer: number | null = null;
let activePreviewElement: Element | null = null;
let pendingPreviewElement: Element | null = null;
let lastPointerPosition: PreviewPointer | null = null;

const shouldDisplayPreview = () => globalEnabled && siteEnabled && previewEnabled;

const clearHoverTimer = () => {
  if (hoverTimer !== null) {
    window.clearTimeout(hoverTimer);
    hoverTimer = null;
  }
};

const cancelPreview = () => {
  clearHoverTimer();
  pendingPreviewElement = null;
  activePreviewElement = null;
  if (tooltip.isVisible()) {
    tooltip.hide();
  }
};

const showPreviewForElement = (element: Element, pointer: PreviewPointer | null) => {
  if (!shouldDisplayPreview() || !element.isConnected) {
    return;
  }
  const url = resolveUrl(element);
  if (!url) {
    return;
  }
  const label = formatPreviewLabel(url);
  activePreviewElement = element;
  tooltip.show(label, element.getBoundingClientRect(), pointer);
};

const schedulePreview = (element: Element, pointer: PreviewPointer | null) => {
  if (!shouldDisplayPreview()) {
    return;
  }
  if (element === activePreviewElement && tooltip.isVisible()) {
    return;
  }

  pendingPreviewElement = element;
  clearHoverTimer();

  const pointerSnapshot = pointer ? { ...pointer } : null;
  hoverTimer = window.setTimeout(() => {
    hoverTimer = null;
    if (!shouldDisplayPreview()) {
      pendingPreviewElement = null;
      return;
    }
    if (!element.isConnected) {
      pendingPreviewElement = null;
      return;
    }
    showPreviewForElement(element, pointerSnapshot);
    pendingPreviewElement = null;
  }, PREVIEW_HOVER_DELAY);
};

const handlePointerEnter = (event: MouseEvent) => {
  if (!shouldDisplayPreview()) {
    return;
  }
  const element = derivePreviewElement(event.target);
  if (!element) {
    return;
  }
  const related = event.relatedTarget as Node | null;
  if (related && element.contains(related)) {
    return;
  }

  const pointer: PreviewPointer = { x: event.clientX, y: event.clientY };
  lastPointerPosition = pointer;
  schedulePreview(element, pointer);
};

const handlePointerLeave = (event: MouseEvent) => {
  const element = derivePreviewElement(event.target);
  if (!element) {
    return;
  }
  const related = event.relatedTarget as Node | null;
  if (related && element.contains(related)) {
    return;
  }
  if (element === pendingPreviewElement || element === activePreviewElement) {
    cancelPreview();
  }
};

const handleFocusIn = (event: FocusEvent) => {
  if (!shouldDisplayPreview()) {
    return;
  }
  const element = derivePreviewElement(event.target);
  if (!element || element === activePreviewElement) {
    return;
  }
  schedulePreview(element, null);
};

const handleFocusOut = (event: FocusEvent) => {
  const element = derivePreviewElement(event.target);
  if (!element) {
    return;
  }
  if (element === pendingPreviewElement || element === activePreviewElement) {
    cancelPreview();
  }
};

const handlePointerMove = (event: MouseEvent) => {
  lastPointerPosition = { x: event.clientX, y: event.clientY };
  if (tooltip.isVisible() && lastPointerPosition) {
    tooltip.updatePointer(lastPointerPosition);
  }
};

const refreshTooltipPosition = () => {
  if (!tooltip.isVisible()) {
    return;
  }
  if (activePreviewElement) {
    tooltip.updateRect(activePreviewElement.getBoundingClientRect());
  } else if (lastPointerPosition) {
    tooltip.updatePointer(lastPointerPosition);
  }
};

const handleVisibilityChange = () => {
  if (document.visibilityState !== 'visible') {
    cancelPreview();
  }
};


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

window.addEventListener('mouseover', handlePointerEnter, true);
window.addEventListener('mouseout', handlePointerLeave, true);
document.addEventListener('focusin', handleFocusIn);
document.addEventListener('focusout', handleFocusOut);
document.addEventListener('mousemove', handlePointerMove, { passive: true });
document.addEventListener('scroll', refreshTooltipPosition, { capture: true, passive: true });
window.addEventListener('resize', refreshTooltipPosition);
document.addEventListener('visibilitychange', handleVisibilityChange);
document.addEventListener('pointerdown', cancelPreview, true);

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

  try {
    const response = await sendMessage<{ type: string }, { enabled: boolean | undefined }>({
      type: MESSAGE_TYPES.getPreviewEnabled
    });
    previewEnabled = typeof response.enabled === 'boolean' ? response.enabled : true;
  } catch (error) {
    console.warn('UnbreakLink failed to obtain preview preference', error);
    previewEnabled = true;
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
    if (!globalEnabled) {
      cancelPreview();
    }
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
    if (!siteEnabled) {
      cancelPreview();
    }
  }
};

const handlePreviewToggle = (message: unknown) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }
  const typed = message as { type?: string; payload?: { enabled?: boolean } };
  if (typed.type !== MESSAGE_TYPES.setPreviewEnabled) {
    return;
  }
  const enabled = typed.payload?.enabled;
  if (typeof enabled === 'boolean') {
    previewEnabled = enabled;
    if (!previewEnabled) {
      cancelPreview();
    }
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
  handlePreviewToggle(message);
  handleModifierMapUpdate(message);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') {
    return;
  }
  if (STORAGE_KEYS.previewEnabled in changes) {
    const entry = changes[STORAGE_KEYS.previewEnabled];
    const nextValue = entry?.newValue;
    previewEnabled = typeof nextValue === 'boolean' ? nextValue : true;
    if (!previewEnabled) {
      cancelPreview();
    }
  }
  if (STORAGE_KEYS.modifierMap in changes) {
    const entry = changes[STORAGE_KEYS.modifierMap];
    modifierMap = normalizeModifierMap(entry.newValue);
  }
});

void initialize();

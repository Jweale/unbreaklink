import { ClickAction, MESSAGE_TYPES } from '../shared/constants';
import { sendMessage } from '../shared/messaging';
import {
  getModifierState,
  isValidClickTarget,
  shouldBypassInterception,
  resolveAction,
  type ModifierMap,
  type ModifierState
} from '../shared/modifier';

const DEFAULT_MAPPING: ModifierMap = {
  'CTRL+PRIMARY': ClickAction.BackgroundTab,
  'META+PRIMARY': ClickAction.BackgroundTab,
  'SHIFT+PRIMARY': ClickAction.NewWindow,
  'MIDDLE': ClickAction.BackgroundTab
};

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

const determineAction = (state: ModifierState): ClickAction => {
  if (state.button === 1) {
    return ClickAction.BackgroundTab;
  }

  if (state.shift && state.button === 0) {
    return ClickAction.NewWindow;
  }

  return resolveAction(state, DEFAULT_MAPPING, ClickAction.None);
};

const interceptEvent = async (event: MouseEvent) => {
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

const events: Array<keyof WindowEventMap> = ['click', 'auxclick'];

for (const eventType of events) {
  window.addEventListener(eventType, (event) => {
    void interceptEvent(event as MouseEvent);
  }, listenerOptions);
}

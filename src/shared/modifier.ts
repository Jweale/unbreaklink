import { MODIFIER_KEYS, ClickAction } from './constants';

export type ModifierState = Record<(typeof MODIFIER_KEYS)[number], boolean> & { button: number };

export type ModifierMap = Record<string, ClickAction>;

export const DEFAULT_MODIFIER_MAP: ModifierMap = Object.freeze({
  'CTRL+PRIMARY': ClickAction.BackgroundTab,
  'META+PRIMARY': ClickAction.BackgroundTab,
  'SHIFT+PRIMARY': ClickAction.NewWindow,
  MIDDLE: ClickAction.BackgroundTab
});

export const getModifierState = (event: MouseEvent): ModifierState => ({
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
  shift: event.shiftKey,
  button: event.button
});

export const formatModifierKey = (state: ModifierState): string => {
  const parts = MODIFIER_KEYS.filter((key) => state[key]).map((key) => key.toUpperCase());
  if (state.button === 1) {
    parts.push('MIDDLE');
  }
  if (state.button === 2) {
    parts.push('RIGHT');
  }
  if (!parts.length) {
    parts.push('PRIMARY');
  }
  return parts.join('+');
};

export const isValidClickTarget = (event: MouseEvent): boolean => {
  const target = event.target as Element | null;
  if (!target) {
    return false;
  }
  if (target.closest('input, textarea, select, [contenteditable="true"]')) {
    return false;
  }
  return Boolean(target.closest('a, [data-unbreaklink-clickable="true"]'));
};

export const shouldBypassInterception = (event: MouseEvent): boolean => {
  if (event.defaultPrevented) {
    return true;
  }
  return event.button > 1 && !event.ctrlKey && !event.metaKey && !event.shiftKey;
};

export const resolveAction = (state: ModifierState, map: ModifierMap, fallback: ClickAction): ClickAction => {
  const key = formatModifierKey(state);
  return map[key] ?? fallback;
};

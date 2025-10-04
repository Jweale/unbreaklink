import { MODIFIER_KEYS, ClickAction, type ModifierKey } from './constants';

export type ModifierState = Record<(typeof MODIFIER_KEYS)[number], boolean> & { button: number };

export type ModifierMap = Record<string, ClickAction>;

export type ButtonKey = 'PRIMARY' | 'MIDDLE' | 'RIGHT';

export const BUTTON_KEYS: readonly ButtonKey[] = ['PRIMARY', 'MIDDLE', 'RIGHT'];

const CLICK_ACTION_VALUES: readonly ClickAction[] = Object.values(ClickAction);

export const isClickAction = (value: unknown): value is ClickAction =>
  typeof value === 'string' && (CLICK_ACTION_VALUES as readonly string[]).includes(value);

export const DEFAULT_MODIFIER_MAP: ModifierMap = Object.freeze({
  'CTRL+PRIMARY': ClickAction.BackgroundTab,
  'META+PRIMARY': ClickAction.BackgroundTab,
  'SHIFT+PRIMARY': ClickAction.NewWindow,
  MIDDLE: ClickAction.BackgroundTab
});

export const emptyModifierFlags = (): Record<ModifierKey, boolean> =>
  MODIFIER_KEYS.reduce<Record<ModifierKey, boolean>>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {} as Record<ModifierKey, boolean>);

export const formatModifierCombination = (
  modifiers: Record<ModifierKey, boolean>,
  button: ButtonKey
): string => {
  const parts = MODIFIER_KEYS.filter((key) => modifiers[key]).map((key) => key.toUpperCase());
  parts.push(button);
  return parts.join('+');
};

export const parseModifierCombination = (combination: string): {
  modifiers: Record<ModifierKey, boolean>;
  button: ButtonKey;
} => {
  const normalized = combination.split('+').map((token) => token.trim().toUpperCase()).filter(Boolean);
  const modifiers = emptyModifierFlags();
  let button: ButtonKey = 'PRIMARY';

  for (const token of normalized) {
    if ((BUTTON_KEYS as readonly string[]).includes(token)) {
      button = token as ButtonKey;
      continue;
    }
    const lower = token.toLowerCase() as ModifierKey;
    if ((MODIFIER_KEYS as readonly string[]).includes(lower)) {
      modifiers[lower] = true;
    }
  }

  return { modifiers, button };
};

export const normalizeModifierMap = (value: unknown): ModifierMap => {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_MODIFIER_MAP };
  }

  const normalizedEntries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, ClickAction] => isClickAction(entry[1]))
    .map(([key, action]) => {
      const { modifiers, button } = parseModifierCombination(key);
      const normalizedKey = formatModifierCombination(modifiers, button);
      return [normalizedKey, action] as const;
    });

  if (!normalizedEntries.length) {
    return { ...DEFAULT_MODIFIER_MAP };
  }

  return normalizedEntries.reduce<ModifierMap>((acc, [key, action]) => {
    acc[key] = action;
    return acc;
  }, {} as ModifierMap);
};

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

export enum ClickAction {
  BackgroundTab = 'background_tab',
  ForegroundTab = 'foreground_tab',
  NewWindow = 'new_window',
  None = 'none'
}

export type ModifierKey = 'alt' | 'ctrl' | 'meta' | 'shift';

export const MODIFIER_KEYS: readonly ModifierKey[] = ['alt', 'ctrl', 'meta', 'shift'];

export const STORAGE_KEYS = {
  globalEnabled: 'globalEnabled',
  siteRules: 'siteRules',
  modifierMap: 'modifierMap'
} as const;

export const MESSAGE_TYPES = {
  updateModifierMap: 'UPDATE_MODIFIER_MAP',
  toggleSite: 'TOGGLE_SITE',
  ping: 'PING',
  executeClickAction: 'EXECUTE_CLICK_ACTION',
  getGlobalEnabled: 'GET_GLOBAL_ENABLED',
  setGlobalEnabled: 'SET_GLOBAL_ENABLED'
} as const;

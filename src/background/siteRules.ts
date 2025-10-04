import { MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';

type SiteRulesMap = Record<string, boolean>;

const SAVE_DEBOUNCE_MS = 250;

const sanitizeOrigin = (origin: string): string | null => {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
};

export const createSiteRuleManager = () => {
  let siteRules: SiteRulesMap = {};
  let saveTimer: number | undefined;
  let loaded = false;

  const scheduleSave = () => {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(async () => {
      saveTimer = undefined;
      await persist();
    }, SAVE_DEBOUNCE_MS);
  };

  const persist = async () => {
    try {
      await chrome.storage.sync.set({ [STORAGE_KEYS.siteRules]: siteRules });
    } catch (error) {
      console.warn('UnbreakLink failed to persist site rules', error);
    }
  };

  const load = async () => {
    if (loaded) {
      return;
    }
    try {
      const stored = await chrome.storage.sync.get(STORAGE_KEYS.siteRules);
      const value = stored[STORAGE_KEYS.siteRules];
      if (value && typeof value === 'object') {
        siteRules = Object.entries(value).reduce<SiteRulesMap>((acc, [key, val]) => {
          if (typeof val === 'boolean') {
            acc[key] = val;
          }
          return acc;
        }, {});
      }
    } catch (error) {
      console.warn('UnbreakLink failed to load site rules', error);
      siteRules = {};
    } finally {
      loaded = true;
    }
  };

  const flush = async () => {
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    await persist();
  };

  const getRuleState = async (origin: string) => {
    await load();
    const key = sanitizeOrigin(origin) ?? origin;
    return { origin: key, enabled: Boolean(siteRules[key]) };
  };

  const setRule = async (origin: string, enabled: boolean) => {
    await load();
    const sanitized = sanitizeOrigin(origin) ?? origin;
    if (enabled) {
      siteRules[sanitized] = true;
    } else {
      delete siteRules[sanitized];
    }
    scheduleSave();

    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.siteRuleUpdated,
        payload: {
          origin: sanitized,
          enabled: Boolean(enabled)
        }
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error && !(error.message ?? '').includes('Receiving end does not exist')) {
          console.warn('UnbreakLink failed to broadcast site rule update', error);
        }
      }
    );

    return { origin: sanitized, enabled: Boolean(enabled) };
  };

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }
    const entry = changes[STORAGE_KEYS.siteRules];
    if (!entry) {
      return;
    }
    const value = entry.newValue;
    if (value && typeof value === 'object') {
      siteRules = Object.entries(value).reduce<SiteRulesMap>((acc, [key, val]) => {
        if (typeof val === 'boolean') {
          acc[key] = val;
        }
        return acc;
      }, {});
    }
  });

  return {
    load,
    flush,
    getRuleState,
    setRule
  };
};

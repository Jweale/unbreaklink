import { createSiteRuleManager } from './siteRules';
import { ClickAction, MESSAGE_TYPES, STORAGE_KEYS } from '../shared/constants';
import { registerMessageHandler } from '../shared/messaging';
import { normalizeModifierMap } from '../shared/modifier';

type ServiceState = {
  startups: number;
  fixCount: number;
};

const state: ServiceState = {
  startups: 0,
  fixCount: 0
};

const siteRuleManager = createSiteRuleManager();

const loadState = async () => {
  try {
    const stored = await chrome.storage.local.get(['startups', 'fixCount']);
    state.startups = Number(stored.startups ?? 0);
    state.fixCount = Number(stored.fixCount ?? 0);
  } catch (error) {
    console.warn('UnbreakLink background failed to load state', error);
    state.startups = 0;
    state.fixCount = 0;
  }
};

const saveState = async () => {
  try {
    await chrome.storage.local.set({ startups: state.startups, fixCount: state.fixCount });
  } catch (error) {
    console.warn('UnbreakLink background failed to persist state', error);
  }
};

const handleClickAction = async (payload: {
  url: string;
  action: ClickAction;
}) => {
  switch (payload.action) {
    case ClickAction.BackgroundTab: {
      await chrome.tabs.create({ url: payload.url, active: false });
      break;
    }
    case ClickAction.ForegroundTab: {
      await chrome.tabs.create({ url: payload.url, active: true });
      break;
    }
    case ClickAction.NewWindow: {
      await chrome.windows.create({ url: payload.url, focused: true });
      break;
    }
    default:
      break;
  }

  state.fixCount += 1;
  await saveState();

  return { ok: true };
};

const getGlobalEnabled = async () => {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.globalEnabled);
  return { enabled: Boolean(stored[STORAGE_KEYS.globalEnabled]) };
};

const setGlobalEnabled = async (enabled: boolean) => {
  const normalized = Boolean(enabled);
  await chrome.storage.sync.set({ [STORAGE_KEYS.globalEnabled]: normalized });
  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.setGlobalEnabled,
      payload: { enabled: normalized }
    },
    () => {
      const error = chrome.runtime.lastError;
      if (!error) {
        return;
      }
      const message = error.message ?? '';
      if (!message.includes('Receiving end does not exist')) {
        console.warn('UnbreakLink background failed to broadcast global state', error);
      }
    }
  );
  return { enabled: normalized };
};

const getPreviewEnabled = async () => {
  const stored = await chrome.storage.sync.get(STORAGE_KEYS.previewEnabled);
  const value = stored[STORAGE_KEYS.previewEnabled];
  return { enabled: typeof value === 'boolean' ? value : true };
};

const setPreviewEnabled = async (enabled: boolean) => {
  const normalized = Boolean(enabled);
  await chrome.storage.sync.set({ [STORAGE_KEYS.previewEnabled]: normalized });
  chrome.runtime.sendMessage(
    {
      type: MESSAGE_TYPES.setPreviewEnabled,
      payload: { enabled: normalized }
    },
    () => {
      const error = chrome.runtime.lastError;
      if (!error) {
        return;
      }
      const message = error.message ?? '';
      if (!message.includes('Receiving end does not exist')) {
        console.warn('UnbreakLink background failed to broadcast preview state', error);
      }
    }
  );
  return { enabled: normalized };
};

const bootstrap = async () => {
  await loadState();
  state.startups += 1;
  await saveState();
  await siteRuleManager.load();

  registerMessageHandler(MESSAGE_TYPES.ping, () => ({ ok: true }));
  registerMessageHandler(MESSAGE_TYPES.executeClickAction, handleClickAction);
  registerMessageHandler(MESSAGE_TYPES.getGlobalEnabled, getGlobalEnabled);
  registerMessageHandler(MESSAGE_TYPES.setGlobalEnabled, setGlobalEnabled);
  registerMessageHandler(MESSAGE_TYPES.getPreviewEnabled, getPreviewEnabled);
  registerMessageHandler(MESSAGE_TYPES.setPreviewEnabled, setPreviewEnabled);
  registerMessageHandler(MESSAGE_TYPES.getSiteRule, async (origin: string) => {
    if (typeof origin !== 'string') {
      return { origin: '', enabled: false };
    }
    return siteRuleManager.getRuleState(origin);
  });
  registerMessageHandler(
    MESSAGE_TYPES.setSiteRule,
    async (payload: { origin: string; enabled: boolean }) => {
      if (!payload || typeof payload.origin !== 'string') {
        return { origin: '', enabled: false };
      }
      return siteRuleManager.setRule(payload.origin, Boolean(payload.enabled));
    }
  );
  registerMessageHandler(MESSAGE_TYPES.updateModifierMap, async (payload) => {
    const normalized = normalizeModifierMap(payload);
    await chrome.storage.sync.set({ [STORAGE_KEYS.modifierMap]: normalized });
    chrome.runtime.sendMessage(
      {
        type: MESSAGE_TYPES.updateModifierMap,
        payload: normalized
      },
      () => {
        const error = chrome.runtime.lastError;
        if (error && !(error.message ?? '').includes('Receiving end does not exist')) {
          console.warn('UnbreakLink background failed to broadcast modifier mapping', error);
        }
      }
    );
    return { ok: true } as const;
  });

  chrome.runtime.onSuspend.addListener(() => {
    console.info('UnbreakLink background service worker suspended', { ...state });
    void saveState();
    void siteRuleManager.flush();
  });
};

void bootstrap();

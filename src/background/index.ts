import { ClickAction, MESSAGE_TYPES } from '../shared/constants';
import { registerMessageHandler } from '../shared/messaging';

type ServiceState = {
  startups: number;
  fixCount: number;
};

const state: ServiceState = {
  startups: 0,
  fixCount: 0
};

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

const bootstrap = async () => {
  await loadState();
  state.startups += 1;
  await saveState();

  registerMessageHandler(MESSAGE_TYPES.ping, () => ({ ok: true }));
  registerMessageHandler(MESSAGE_TYPES.executeClickAction, handleClickAction);

  chrome.runtime.onSuspend.addListener(() => {
    console.info('UnbreakLink background service worker suspended', { ...state });
    void saveState();
  });
};

void bootstrap();

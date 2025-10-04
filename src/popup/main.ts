import { MESSAGE_TYPES } from '../shared/constants';
import { sendMessage } from '../shared/messaging';

const app = document.querySelector('#app');

if (!app) {
  throw new Error('Popup root element missing');
}

type PermissionResult = boolean;

const withCallback = <T>(executor: (resolve: (value: T) => void, reject: (reason: Error) => void) => void) =>
  new Promise<T>((resolve, reject) => {
    executor(
      (value) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(value);
      },
      reject
    );
  });

const queryActiveTab = () =>
  withCallback<chrome.tabs.Tab | undefined>((resolve, reject) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]);
      });
    } catch (error) {
      reject(error as Error);
    }
  });

const permissionsContains = (originPattern: string) =>
  withCallback<PermissionResult>((resolve, reject) => {
    try {
      chrome.permissions.contains({ origins: [originPattern] }, (granted) => {
        resolve(Boolean(granted));
      });
    } catch (error) {
      reject(error as Error);
    }
  });

const permissionsRequest = (originPattern: string) =>
  withCallback<PermissionResult>((resolve, reject) => {
    try {
      chrome.permissions.request({ origins: [originPattern] }, (granted) => {
        resolve(Boolean(granted));
      });
    } catch (error) {
      reject(error as Error);
    }
  });

const permissionsRemove = (originPattern: string) =>
  withCallback<PermissionResult>((resolve, reject) => {
    try {
      chrome.permissions.remove({ origins: [originPattern] }, (removed) => {
        resolve(Boolean(removed));
      });
    } catch (error) {
      reject(error as Error);
    }
  });

app.innerHTML = '';

const heading = document.createElement('h1');
heading.textContent = 'UnbreakLink';

const globalStatusLine = document.createElement('p');
const globalToggleButton = document.createElement('button');
globalToggleButton.disabled = true;

const siteLine = document.createElement('p');
const siteStatusLine = document.createElement('p');
const siteToggleButton = document.createElement('button');
siteToggleButton.disabled = true;

globalStatusLine.textContent = 'Checking global status…';
globalToggleButton.textContent = 'Loading…';
siteLine.textContent = 'Determining active site…';
siteStatusLine.textContent = '';
siteToggleButton.textContent = 'Loading…';

app.append(heading, globalStatusLine, globalToggleButton, siteLine, siteStatusLine, siteToggleButton);

type PopupState = {
  globalEnabled: boolean;
  originPattern: string | null;
  sanitizedOrigin: string | null;
  hasPermission: boolean;
  siteRuleEnabled: boolean;
};

const state: PopupState = {
  globalEnabled: false,
  originPattern: null,
  sanitizedOrigin: null,
  hasPermission: false,
  siteRuleEnabled: false
};

const renderGlobal = () => {
  if (state.globalEnabled) {
    globalStatusLine.textContent = 'Extension is enabled globally.';
    globalToggleButton.textContent = 'Disable globally';
  } else {
    globalStatusLine.textContent = 'Extension is disabled globally.';
    globalToggleButton.textContent = 'Enable globally';
  }
  globalToggleButton.disabled = false;
};

const renderSite = () => {
  if (!state.originPattern) {
    siteLine.textContent = 'No compatible site detected.';
    siteStatusLine.textContent = 'Open a standard web page to manage permissions.';
    siteToggleButton.textContent = 'Unavailable';
    siteToggleButton.disabled = true;
    return;
  }

  const site = state.originPattern.replace('/*', '');
  siteLine.textContent = `Site: ${site}`;

  if (!state.globalEnabled) {
    siteStatusLine.textContent = 'Enable globally to manage this site.';
    siteToggleButton.textContent = 'Enable globally first';
    siteToggleButton.disabled = true;
    return;
  }

  if (state.hasPermission && state.siteRuleEnabled) {
    siteStatusLine.textContent = 'Enabled for this site.';
    siteToggleButton.textContent = 'Disable for this site';
    siteToggleButton.disabled = false;
    return;
  }

  if (!state.hasPermission) {
    siteStatusLine.textContent = 'Not yet enabled for this site.';
  } else {
    siteStatusLine.textContent = 'Fix disabled for this site.';
  }
  siteToggleButton.textContent = 'Enable for this site';
  siteToggleButton.disabled = false;
};

const renderUi = () => {
  renderGlobal();
  renderSite();
};

const deriveOriginPattern = (urlString: string | undefined): string | null => {
  if (!urlString) {
    return null;
  }
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return `${url.origin}/*`;
  } catch (error) {
    console.warn('Failed to parse URL', error);
    return null;
  }
};

const originFromPattern = (pattern: string | null) => {
  if (!pattern) {
    return null;
  }
  if (pattern.endsWith('/*')) {
    return pattern.slice(0, -2);
  }
  return pattern;
};

const loadGlobalEnabled = async () => {
  globalToggleButton.disabled = true;
  globalStatusLine.textContent = 'Checking global status…';
  globalToggleButton.textContent = 'Loading…';

  try {
    const response = await sendMessage<{ type: string }, { enabled: boolean }>({
      type: MESSAGE_TYPES.getGlobalEnabled
    });
    state.globalEnabled = Boolean(response.enabled);
    renderGlobal();
  } catch (error) {
    state.globalEnabled = false;
    globalStatusLine.textContent = `Failed to read global status: ${(error as Error).message}`;
    globalToggleButton.textContent = 'Retry';
    globalToggleButton.disabled = false;
  }
};

const loadSiteRule = async () => {
  if (!state.sanitizedOrigin) {
    state.siteRuleEnabled = false;
    return;
  }

  try {
    const response = await sendMessage<
      { type: string; payload: string },
      { origin: string; enabled: boolean }
    >({
      type: MESSAGE_TYPES.getSiteRule,
      payload: state.sanitizedOrigin
    });
    state.sanitizedOrigin = response.origin ?? state.sanitizedOrigin;
    state.siteRuleEnabled = Boolean(response.enabled);
  } catch (error) {
    state.siteRuleEnabled = false;
    console.warn('Failed to load site rule', error);
  }
};

const loadSiteState = async () => {
  siteToggleButton.disabled = true;
  siteStatusLine.textContent = 'Checking site permissions…';

  try {
    const tab = await queryActiveTab();
    state.originPattern = deriveOriginPattern(tab?.url);
    state.sanitizedOrigin = originFromPattern(state.originPattern);
    if (!state.originPattern) {
      state.hasPermission = false;
      state.siteRuleEnabled = false;
      renderSite();
      return;
    }
    state.hasPermission = await permissionsContains(state.originPattern);
    await loadSiteRule();
    renderSite();
  } catch (error) {
    siteLine.textContent = 'Unable to load current tab information.';
    siteStatusLine.textContent = (error as Error).message;
    siteToggleButton.textContent = 'Retry';
    siteToggleButton.disabled = false;
    state.hasPermission = false;
    state.siteRuleEnabled = false;
  }
};

const loadState = async () => {
  await loadGlobalEnabled();
  await loadSiteState();
};

globalToggleButton.addEventListener('click', async () => {
  globalToggleButton.disabled = true;
  globalStatusLine.textContent = 'Updating global setting…';

  try {
    const response = await sendMessage<{ type: string; payload: boolean }, { enabled: boolean }>({
      type: MESSAGE_TYPES.setGlobalEnabled,
      payload: !state.globalEnabled
    });
    state.globalEnabled = Boolean(response.enabled);
    renderGlobal();
    await loadSiteState();
  } catch (error) {
    globalStatusLine.textContent = `Failed to update global status: ${(error as Error).message}`;
    globalToggleButton.textContent = 'Retry';
    globalToggleButton.disabled = false;
  }
});

siteToggleButton.addEventListener('click', async () => {
  if (!state.originPattern) {
    await loadState();
    return;
  }

  if (!state.globalEnabled) {
    siteStatusLine.textContent = 'Enable globally to manage site permissions.';
    return;
  }

  siteToggleButton.disabled = true;
  siteStatusLine.textContent = 'Processing…';

  try {
    if (state.hasPermission && state.siteRuleEnabled) {
      const removed = await permissionsRemove(state.originPattern);
      state.hasPermission = state.hasPermission && !removed;
      if (state.sanitizedOrigin) {
        try {
          const response = await sendMessage<
            { type: string; payload: { origin: string; enabled: boolean } },
            { origin: string; enabled: boolean }
          >({
            type: MESSAGE_TYPES.setSiteRule,
            payload: { origin: state.sanitizedOrigin, enabled: false }
          });
          state.sanitizedOrigin = response.origin ?? state.sanitizedOrigin;
          state.siteRuleEnabled = Boolean(response.enabled);
        } catch (error) {
          console.warn('Failed to disable site rule', error);
          state.siteRuleEnabled = false;
        }
      } else {
        state.siteRuleEnabled = false;
      }
    } else {
      const granted = await permissionsRequest(state.originPattern);
      state.hasPermission = granted;
      if (granted && state.sanitizedOrigin) {
        try {
          const response = await sendMessage<
            { type: string; payload: { origin: string; enabled: boolean } },
            { origin: string; enabled: boolean }
          >({
            type: MESSAGE_TYPES.setSiteRule,
            payload: { origin: state.sanitizedOrigin, enabled: true }
          });
          state.sanitizedOrigin = response.origin ?? state.sanitizedOrigin;
          state.siteRuleEnabled = Boolean(response.enabled);
        } catch (error) {
          console.warn('Failed to enable site rule', error);
          state.siteRuleEnabled = false;
        }
      } else if (!granted) {
        state.siteRuleEnabled = false;
        siteStatusLine.textContent = 'Permission was not granted.';
      }
    }
  } catch (error) {
    siteStatusLine.textContent = (error as Error).message;
    siteToggleButton.disabled = false;
    return;
  }

  renderSite();
});

void loadState();

chrome.runtime.onMessage.addListener((message) => {
  if (typeof message !== 'object' || message === null) {
    return;
  }
  const typed = message as {
    type?: string;
    payload?: { enabled?: boolean; origin?: string };
  };

  if (typed.type === MESSAGE_TYPES.setGlobalEnabled) {
    const enabled = typed.payload?.enabled;
    if (typeof enabled === 'boolean') {
      state.globalEnabled = enabled;
      renderUi();
    }
    return;
  }

  if (typed.type === MESSAGE_TYPES.siteRuleUpdated) {
    const origin = typed.payload?.origin;
    if (origin && origin === state.sanitizedOrigin && typeof typed.payload?.enabled === 'boolean') {
      state.siteRuleEnabled = typed.payload.enabled;
      renderSite();
    }
  }
});

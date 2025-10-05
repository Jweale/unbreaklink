import { MESSAGE_TYPES } from '../shared/constants';
import { sendMessage } from '../shared/messaging';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Popup root element missing');
}

type PermissionResult = boolean;
const REPORT_ISSUE_URL = 'https://github.com/Jweale/unbreaklink/issues/new';

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

const createTab = (url: string) =>
  withCallback<chrome.tabs.Tab | undefined>((resolve, reject) => {
    try {
      chrome.tabs.create({ url }, (tab) => {
        resolve(tab);
      });
    } catch (error) {
      reject(error as Error);
    }
  });

const injectStyles = () => {
  if (document.head.querySelector('[data-popup-style]')) {
    return;
  }
  const style = document.createElement('style');
  style.dataset.popupStyle = 'true';
  style.textContent = `
    :root {
      color-scheme: light;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      --color-surface: #ECDFF2;
      --color-text: #1F261C;
      --color-card-bg: #D0D9C7;
      --color-card-border: #6D7356;
      --color-accent: #6D7356;
      --color-accent-hover: color-mix(in srgb, #6D7356 80%, #ECDFF2 20%);
      --color-accent-text: #ECDFF2;
      --color-muted: #D4D9B0;
      --color-callout-bg: #ECDFF2;
      --color-callout-border: #6D7356;
      --color-link-hover-bg: rgba(109, 115, 86, 0.12);
    }
    html, body {
      margin: 0;
      padding: 0;
      background: var(--color-surface);
      color: var(--color-text);
    }
    #app {
      min-width: 280px;
      max-width: 320px;
      padding: 12px;
      background: transparent;
    }
    .popup {
      display: flex;
      flex-direction: column;
      gap: 12px;
      border-radius: 20px;
      border: 1px solid var(--color-card-border);
      padding: 16px;
      background: var(--color-card-bg);
      box-shadow: 0 8px 24px rgba(31, 38, 28, 0.15);
    }
    .popup__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .popup__title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .popup__actions {
      display: flex;
      gap: 4px;
    }
    button {
      font: inherit;
      border-radius: 16px;
      border: 1px solid var(--color-card-border);
      padding: 6px 12px;
      background: var(--color-muted);
      color: var(--color-text);
      cursor: pointer;
      transition: background 120ms ease, transform 120ms ease;
    }
    button:hover:not([disabled]) {
      background: var(--color-callout-bg);
    }
    button:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
    button[disabled] {
      cursor: not-allowed;
      opacity: 0.6;
    }
    button.popup__link {
      border: none;
      padding: 4px 8px;
      border-radius: 10px;
      background: transparent;
      color: var(--color-accent);
      text-decoration: underline;
    }
    button.popup__link:hover {
      color: var(--color-accent-hover);
      background: var(--color-link-hover-bg);
    }
    .card {
      border-radius: 12px;
      border: 1px solid var(--color-card-border);
      padding: 12px;
      background: rgba(236, 223, 242, 0.85);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .card__title {
      margin: 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.7;
    }
    .status-text {
      margin: 0;
      line-height: 1.4;
    }
    .callout {
      border-radius: 10px;
      padding: 10px;
      background: var(--color-callout-bg);
      border: 1px solid var(--color-callout-border);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .callout__text {
      margin: 0;
    }
    .primary-button {
      background: var(--color-accent);
      color: var(--color-accent-text);
      border-color: var(--color-accent);
    }
    .primary-button:hover:not([disabled]) {
      background: var(--color-accent-hover);
      border-color: var(--color-accent-hover);
    }
    .primary-button:active {
      transform: translateY(1px);
    }
    .site-origin {
      font-weight: 600;
      margin: 0;
    }
  `;
  document.head.append(style);
};

app.innerHTML = '';

injectStyles();

const container = document.createElement('div');
container.className = 'popup';

const header = document.createElement('div');
header.className = 'popup__header';

const heading = document.createElement('h1');
heading.className = 'popup__title';
heading.textContent = 'UnbreakLink';

const quickActions = document.createElement('div');
quickActions.className = 'popup__actions';

const openOptionsButton = document.createElement('button');
openOptionsButton.type = 'button';
openOptionsButton.className = 'popup__link';
openOptionsButton.textContent = 'Options';

const reportIssueButton = document.createElement('button');
reportIssueButton.type = 'button';
reportIssueButton.className = 'popup__link';
reportIssueButton.textContent = 'Report issue';

quickActions.append(openOptionsButton, reportIssueButton);
header.append(heading, quickActions);

const globalCard = document.createElement('section');
globalCard.className = 'card';

const globalCardTitle = document.createElement('p');
globalCardTitle.className = 'card__title';
globalCardTitle.textContent = 'Global control';

const globalStatusLine = document.createElement('p');
globalStatusLine.className = 'status-text';

const globalToggleButton = document.createElement('button');
globalToggleButton.type = 'button';
globalToggleButton.className = 'primary-button';
globalToggleButton.disabled = true;

globalCard.append(globalCardTitle, globalStatusLine, globalToggleButton);

const siteCard = document.createElement('section');
siteCard.className = 'card';

const siteCardTitle = document.createElement('p');
siteCardTitle.className = 'card__title';
siteCardTitle.textContent = 'Site control';

const siteLine = document.createElement('p');
siteLine.className = 'site-origin';

const siteStatusLine = document.createElement('p');
siteStatusLine.className = 'status-text';

const siteToggleButton = document.createElement('button');
siteToggleButton.type = 'button';
siteToggleButton.className = 'primary-button';
siteToggleButton.disabled = true;

const permissionCallout = document.createElement('div');
permissionCallout.className = 'callout';
permissionCallout.hidden = true;

const permissionText = document.createElement('p');
permissionText.className = 'callout__text';

const permissionButton = document.createElement('button');
permissionButton.type = 'button';
permissionButton.className = 'primary-button';
permissionButton.textContent = 'Allow this site';

permissionCallout.append(permissionText, permissionButton);
const permissionPatternLine = document.createElement('p');
permissionPatternLine.className = 'status-text';
permissionPatternLine.hidden = true;

const permissionAssurance = document.createElement('p');
permissionAssurance.className = 'status-text';
permissionAssurance.textContent =
  'UnbreakLink only inspects link destinations on approved pages to remove trackers. No remote code is executed and no browsing data leaves your device.';

siteCard.append(
  siteCardTitle,
  siteLine,
  siteStatusLine,
  siteToggleButton,
  permissionCallout,
  permissionPatternLine,
  permissionAssurance
);

container.append(header, globalCard, siteCard);
app.append(container);

globalStatusLine.textContent = 'Checking global status…';
globalToggleButton.textContent = 'Loading…';
siteLine.textContent = 'Determining active site…';
siteStatusLine.textContent = '';
siteToggleButton.textContent = 'Loading…';

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
    globalStatusLine.textContent = 'UnbreakLink is enabled everywhere.';
    globalToggleButton.textContent = 'Disable globally';
  } else {
    globalStatusLine.textContent = 'UnbreakLink is disabled globally.';
    globalToggleButton.textContent = 'Enable globally';
  }
  globalToggleButton.disabled = false;
};

const renderSite = () => {
  if (state.originPattern) {
    permissionPatternLine.hidden = false;
    permissionPatternLine.textContent = `Host permission applies to: ${state.originPattern}. Access is used only to read link targets on this site.`;
  } else {
    permissionPatternLine.hidden = true;
    permissionPatternLine.textContent = '';
  }

  if (!state.originPattern) {
    siteLine.textContent = 'No compatible site detected';
    siteStatusLine.textContent = 'Open a standard web page to manage permissions.';
    siteToggleButton.textContent = 'Unavailable';
    siteToggleButton.disabled = true;
    permissionCallout.hidden = true;
    return;
  }

  const site = state.originPattern.replace('/*', '');
  siteLine.textContent = site;

  if (!state.globalEnabled) {
    siteStatusLine.textContent = 'Enable UnbreakLink globally to manage this site.';
    siteToggleButton.textContent = 'Enable globally first';
    siteToggleButton.disabled = true;
    permissionCallout.hidden = true;
    return;
  }

  if (state.hasPermission && state.siteRuleEnabled) {
    siteStatusLine.textContent = 'Fixes are active on this site.';
    siteToggleButton.textContent = 'Disable for this site';
    siteToggleButton.disabled = false;
    permissionCallout.hidden = true;
    return;
  }

  if (!state.hasPermission) {
    siteStatusLine.textContent = 'Allow access to let UnbreakLink fix redirects on this site.';
    siteToggleButton.textContent = 'Enable for this site';
    siteToggleButton.disabled = false;
    permissionText.textContent = `Grant host permission for ${state.originPattern} so UnbreakLink can clean up links directly in the page.`;
    permissionCallout.hidden = false;
    return;
  }

  siteStatusLine.textContent = 'Fixes are currently disabled for this site.';
  siteToggleButton.textContent = 'Enable for this site';
  siteToggleButton.disabled = false;
  permissionCallout.hidden = true;
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
    await syncSiteRuleWithPermission();
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

let siteOperationInProgress = false;

const enableSite = async () => {
  if (siteOperationInProgress) {
    return false;
  }
  siteOperationInProgress = true;

  try {
    if (!state.originPattern) {
      await loadState();
      return false;
    }

    if (!state.hasPermission) {
      const granted = await permissionsRequest(state.originPattern);
      state.hasPermission = granted;
      if (!granted) {
        return false;
      }
    }

    if (state.sanitizedOrigin) {
      const response = await sendMessage<
        { type: string; payload: { origin: string; enabled: boolean } },
        { origin: string; enabled: boolean }
      >({
        type: MESSAGE_TYPES.setSiteRule,
        payload: { origin: state.sanitizedOrigin, enabled: true }
      });
      state.sanitizedOrigin = response.origin ?? state.sanitizedOrigin;
      state.siteRuleEnabled = Boolean(response.enabled);
    } else {
      state.siteRuleEnabled = true;
    }

    return true;
  } finally {
    siteOperationInProgress = false;
  }
};

const disableSite = async () => {
  if (siteOperationInProgress) {
    return false;
  }
  siteOperationInProgress = true;

  try {
    if (!state.originPattern) {
      await loadState();
      return false;
    }

    const removed = await permissionsRemove(state.originPattern);
    if (removed) {
      state.hasPermission = false;
    }

    if (state.sanitizedOrigin) {
      const response = await sendMessage<
        { type: string; payload: { origin: string; enabled: boolean } },
        { origin: string; enabled: boolean }
      >({
        type: MESSAGE_TYPES.setSiteRule,
        payload: { origin: state.sanitizedOrigin, enabled: false }
      });
      state.sanitizedOrigin = response.origin ?? state.sanitizedOrigin;
      state.siteRuleEnabled = Boolean(response.enabled);
    } else {
      state.siteRuleEnabled = false;
    }

    return true;
  } finally {
    siteOperationInProgress = false;
  }
};

const syncSiteRuleWithPermission = async () => {
  if (!state.sanitizedOrigin) {
    return;
  }

  if (state.hasPermission === state.siteRuleEnabled) {
    return;
  }

  try {
    const response = await sendMessage<
      { type: string; payload: { origin: string; enabled: boolean } },
      { origin: string; enabled: boolean }
    >({
      type: MESSAGE_TYPES.setSiteRule,
      payload: { origin: state.sanitizedOrigin, enabled: state.hasPermission }
    });
    state.sanitizedOrigin = response.origin ?? state.sanitizedOrigin;
    state.siteRuleEnabled = Boolean(response.enabled);
  } catch (error) {
    console.warn('Failed to synchronize site rule state', error);
  }
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

  if (siteOperationInProgress) {
    return;
  }

  siteToggleButton.disabled = true;
  const disabling = state.hasPermission && state.siteRuleEnabled;
  siteStatusLine.textContent = disabling ? 'Disabling…' : 'Enabling…';

  let operationSuccessful = false;

  try {
    if (disabling) {
      operationSuccessful = await disableSite();
    } else {
      operationSuccessful = await enableSite();
    }
  } catch (error) {
    siteToggleButton.disabled = false;
    renderSite();
    siteStatusLine.textContent = (error as Error).message;
    return;
  }

  renderSite();
  if (!disabling && !operationSuccessful && !state.hasPermission) {
    siteStatusLine.textContent = 'Permission request was denied.';
    permissionText.textContent = `Chrome blocked the request for ${state.originPattern ?? 'this site'}. Try again to grant host permission.`;
    permissionCallout.hidden = false;
  }
});

permissionButton.addEventListener('click', async () => {
  if (!state.originPattern) {
    await loadState();
    return;
  }

  if (!state.globalEnabled) {
    siteStatusLine.textContent = 'Enable UnbreakLink globally to manage this site.';
    return;
  }

  if (siteOperationInProgress) {
    return;
  }

  permissionButton.disabled = true;
  permissionButton.textContent = 'Requesting…';
  siteStatusLine.textContent = 'Requesting permission…';

  let enabled = false;
  try {
    enabled = await enableSite();
  } catch (error) {
    permissionButton.textContent = 'Allow this site';
    permissionButton.disabled = false;
    renderSite();
    siteStatusLine.textContent = (error as Error).message;
    return;
  }

  permissionButton.textContent = 'Allow this site';
  permissionButton.disabled = false;
  renderSite();
  if (!enabled && !state.hasPermission) {
    siteStatusLine.textContent = 'Permission request was denied.';
    permissionText.textContent = `Chrome blocked the request for ${state.originPattern ?? 'this site'}. Try again to grant host permission.`;
    permissionCallout.hidden = false;
  }
});

openOptionsButton.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    void chrome.runtime.openOptionsPage();
  }
});

reportIssueButton.addEventListener('click', () => {
  createTab(REPORT_ISSUE_URL).catch((error) => {
    console.warn('Failed to open report issue tab', error);
  });
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

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
const siteLine = document.createElement('p');
const statusLine = document.createElement('p');
const toggleButton = document.createElement('button');
toggleButton.disabled = true;

app.append(heading, siteLine, statusLine, toggleButton);

type PopupState = {
  originPattern: string | null;
  hasPermission: boolean;
};

const state: PopupState = {
  originPattern: null,
  hasPermission: false
};

const updateUi = () => {
  if (!state.originPattern) {
    siteLine.textContent = 'No compatible site detected.';
    statusLine.textContent = 'Open a standard web page to manage permissions.';
    toggleButton.textContent = 'Unavailable';
    toggleButton.disabled = true;
    return;
  }

  const site = state.originPattern.replace('/*', '');
  siteLine.textContent = `Site: ${site}`;
  if (state.hasPermission) {
    statusLine.textContent = 'Enabled for this site.';
    toggleButton.textContent = 'Disable for this site';
  } else {
    statusLine.textContent = 'Not yet enabled for this site.';
    toggleButton.textContent = 'Enable for this site';
  }
  toggleButton.disabled = false;
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

const loadState = async () => {
  try {
    const tab = await queryActiveTab();
    state.originPattern = deriveOriginPattern(tab?.url);
    if (!state.originPattern) {
      updateUi();
      return;
    }
    state.hasPermission = await permissionsContains(state.originPattern);
    updateUi();
  } catch (error) {
    siteLine.textContent = 'Unable to load current tab information.';
    statusLine.textContent = (error as Error).message;
    toggleButton.textContent = 'Retry';
    toggleButton.disabled = false;
  }
};

toggleButton.addEventListener('click', async () => {
  if (!state.originPattern) {
    await loadState();
    return;
  }

  toggleButton.disabled = true;
  statusLine.textContent = 'Processing…';

  try {
    if (state.hasPermission) {
      const removed = await permissionsRemove(state.originPattern);
      state.hasPermission = state.hasPermission && !removed;
    } else {
      const granted = await permissionsRequest(state.originPattern);
      state.hasPermission = granted;
    }
  } catch (error) {
    statusLine.textContent = (error as Error).message;
    toggleButton.disabled = false;
    return;
  }

  updateUi();
});

void loadState();

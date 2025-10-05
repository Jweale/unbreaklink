import { ClickAction, STORAGE_KEYS } from './constants';

export type ModifierFallbackEvent = {
  combination: string;
  resolvedAction: ClickAction;
  reason: 'missing' | 'invalid' | 'unassigned';
};

let telemetryEnabled = false;
let telemetryLoaded = false;
let telemetryLoading: Promise<void> | null = null;

const readTelemetryEnabled = async () => {
  if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
    telemetryEnabled = false;
    telemetryLoaded = true;
    telemetryLoading = null;
    return;
  }
  try {
    const stored = await chrome.storage.sync.get(STORAGE_KEYS.telemetryEnabled);
    telemetryEnabled = Boolean(stored[STORAGE_KEYS.telemetryEnabled]);
  } catch (error) {
    console.warn('UnbreakLink telemetry flag read failed', error);
    telemetryEnabled = false;
  } finally {
    telemetryLoaded = true;
    telemetryLoading = null;
  }
};

const ensureTelemetryLoaded = () => {
  if (telemetryLoaded) {
    return;
  }
  if (!telemetryLoading) {
    telemetryLoading = readTelemetryEnabled();
  }
};

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') {
      return;
    }
    if (STORAGE_KEYS.telemetryEnabled in changes) {
      const entry = changes[STORAGE_KEYS.telemetryEnabled];
      telemetryEnabled = Boolean(entry.newValue);
      telemetryLoaded = true;
    }
  });
}

export const isTelemetryEnabled = () => {
  if (!telemetryLoaded) {
    ensureTelemetryLoaded();
  }
  return telemetryEnabled;
};

export const reportModifierFallback = (event: ModifierFallbackEvent) => {
  if (!telemetryLoaded) {
    ensureTelemetryLoaded();
  }
  if (!telemetryEnabled) {
    return;
  }
  console.info('UnbreakLink modifier fallback', event);
};

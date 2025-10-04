chrome.runtime.onInstalled.addListener(() => {
  console.info('UnbreakLink background service worker installed.');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ ok: true });
  }
  return false;
});

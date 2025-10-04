const manifest: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: 'UnbreakLink',
  version: '0.0.1',
  description: 'Restore modifier-click behaviour with per-site control.',
  permissions: ['scripting', 'storage', 'tabs', 'activeTab'],
  host_permissions: ['<all_urls>'],
  action: {
    default_popup: 'popup.html'
  },
  options_page: 'options.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_start'
    }
  ]
};

export default manifest;

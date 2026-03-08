// If config.js is not configure these variables will be used instead
export const defaultsAppConfig = {
  // URL of the Backend, provided by FAST API.
  apiBaseUrl: 'http://127.0.0.1:8000',
  // Main currency of the app.
  currency: 'usd',
  // API key for multi-user mode (leave empty for local dev without users.json).
  apiKey: '',
  // Optional display name override (shown in the sidebar).
  displayName: '',
};

export const finalAppConfig = await (async () => {
  try {
    const { appConfig } = await import('./config.js');
    return { ...defaultsAppConfig, ...(appConfig || {}) };
  } catch {
    return { ...defaultsAppConfig };
  }
})();

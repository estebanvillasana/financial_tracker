const DEFAULT_APP_SETTINGS = Object.freeze({
  currency: 'usd',
});

const appSettings = {
  ...DEFAULT_APP_SETTINGS,
};

function applyAppSettings(next = {}) {
  const currency = String(next?.currency || '').trim().toLowerCase();
  appSettings.currency = currency || DEFAULT_APP_SETTINGS.currency;
  return appSettings;
}

function getMainCurrency() {
  return appSettings.currency || DEFAULT_APP_SETTINGS.currency;
}

export { DEFAULT_APP_SETTINGS, appSettings, applyAppSettings, getMainCurrency };

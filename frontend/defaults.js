// If config.js is not configure these variables will be used instead

export const defaultsAppConfig = {
	// URL of the Backend, provided by FAST API.
	apiBaseUrl: 'http://127.0.0.1:8000',

	// Main currency of the app.
	currency: 'usd',
};

export const finalAppConfig = await (async () => {
	const savedCurrency = localStorage.getItem('ft-app-currency');
	try {
		const { appConfig } = await import('./config.js');
		const base = { ...defaultsAppConfig, ...(appConfig || {}) };
		if (savedCurrency) base.currency = savedCurrency;
		return base;
	} catch {
		const base = { ...defaultsAppConfig };
		if (savedCurrency) base.currency = savedCurrency;
		return base;
	}
})();

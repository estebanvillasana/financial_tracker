import { finalAppConfig } from '../defaults.js';

/**
 * Fetches the current user's name from the backend.
 * Uses displayName from config.js if set; otherwise calls GET /me.
 * Returns null in local-dev mode (no API key configured).
 *
 * @returns {Promise<string|null>}
 */
async function fetchCurrentUserName() {
  if (finalAppConfig.displayName) {
    return String(finalAppConfig.displayName).trim();
  }
  if (!finalAppConfig.apiKey) {
    return null;
  }
  try {
    const data = await request('/me');
    return data?.name ? String(data.name).trim() : null;
  } catch {
    return null;
  }
}

/**
 * Custom error class for API-related failures
 */
class ApiError extends Error {
  constructor(message, { status, data }) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // HTTP status code (0 for network errors)
    this.data = data;     // Parsed response body
  }
}

/**
 * Builds a full URL with query parameters
 * @param {string} path - The API endpoint path
 * @param {Object} query - Optional query parameters
 * @returns {string} - The complete URL
 */
function buildUrl(path, query) {
  const baseUrl = finalAppConfig.apiBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Support relative apiBaseUrl (e.g. '/api') by resolving against current origin
  const absoluteBase = baseUrl.match(/^https?:\/\//)
    ? baseUrl
    : `${window.location.origin}${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;

  const url = new URL(`${absoluteBase}${normalizedPath}`);

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (Array.isArray(value)) {
        value.forEach(item => url.searchParams.append(key, String(item)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

/**
 * Parses the fetch response based on content type
 * @param {Response} response - The fetch Response object
 * @returns {Promise<any>} - Parsed JSON, text, or null
 */
async function parseResponse(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (!text) return null;

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return text;
}

/**
 * Core fetch wrapper with error handling and JSON support
 * @param {string} path - API endpoint
 * @param {Object} options - Request options (method, query, body, headers)
 * @returns {Promise<any>} - Parsed response data
 * @throws {ApiError}
 */
async function request(path, { method = 'GET', query, body, headers } = {}) {
  const url = buildUrl(path, query);
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  // Send API key when configured (multi-user mode).
  const apiKey = finalAppConfig.apiKey;
  if (apiKey) {
    requestHeaders['X-API-Key'] = apiKey;
  }

  const options = { method, headers: requestHeaders };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    // Handle network errors (e.g., CORS, offline, DNS)
    throw new ApiError(error?.message || 'Network error', { status: 0, data: null });
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    // Attempt to extract error message from API response
    const message =
      data?.detail?.[0]?.msg ||
      (typeof data?.detail === 'string' ? data.detail : null) ||
      data?.message ||
      response.statusText ||
      'Request failed';

    throw new ApiError(message, { status: response.status, data });
  }

  return data;
}

export { ApiError, request, buildUrl, fetchCurrentUserName };

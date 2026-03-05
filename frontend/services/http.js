import { appConfig } from '../config.js';

class ApiError extends Error {
  constructor(message, { status, data }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path, query) {
  const baseUrl = appConfig.apiBaseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

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

async function request(path, { method = 'GET', query, body, headers } = {}) {
  const url = buildUrl(path, query);
  const requestHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  const options = { method, headers: requestHeaders };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    throw new ApiError(error?.message || 'Network error', { status: 0, data: null });
  }

  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      data?.detail?.[0]?.msg ||
      data?.message ||
      response.statusText ||
      'Request failed';

    throw new ApiError(message, { status: response.status, data });
  }

  return data;
}

export { ApiError, request, buildUrl };

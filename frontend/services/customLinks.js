import { request } from './http.js';

async function fetchCustomLinks() {
  return request('/custom-links');
}

async function saveCustomLinks(data) {
  return request('/custom-links', { method: 'PUT', body: data });
}

export { fetchCustomLinks, saveCustomLinks };

import { buildUrl } from './http.js';
import { finalAppConfig } from '../defaults.js';

/**
 * Uploads a PDF file and returns extracted table data.
 *
 * Unlike the JSON-based `request()` helper, this sends multipart/form-data
 * so the backend receives the raw file via FastAPI's UploadFile.
 *
 * @param {File} file - PDF File object from an <input> or drag-and-drop
 * @returns {Promise<{ filename: string, page_count: number, tables: Array }>}
 */
async function parsePdf(file) {
  const url = buildUrl('/pdf/parse-tables');

  const headers = { Accept: 'application/json' };
  const apiKey = finalAppConfig.apiKey;
  if (apiKey) headers['X-API-Key'] = apiKey;

  const form = new FormData();
  form.append('file', file);

  let response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: form });
  } catch (error) {
    throw new Error(error?.message || 'Network error while uploading PDF.');
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.detail || response.statusText || 'Failed to parse PDF.';
    throw new Error(message);
  }

  return data;
}

export { parsePdf };

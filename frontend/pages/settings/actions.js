import { finalAppConfig } from '../../defaults.js';
import { ApiError, buildUrl, request } from '../../services/http.js';

export function fetchSettings() {
  return Promise.all([
    request('/app-config'),
    request('/app-config/database'),
  ]).then(([settings, database]) => ({
    ...settings,
    database,
  }));
}

export function saveSettings(body) {
  return request('/app-config', { method: 'PATCH', body });
}

export async function downloadDatabaseSnapshot() {
  return downloadFile('/app-config/database/download', 'Failed to download database', 'financial-tracker.db');
}

export async function exportDatabaseWorkbook() {
  return downloadFile('/app-config/database/export-excel', 'Failed to export database workbook', 'financial-tracker.xlsx');
}

async function downloadFile(path, fallbackMessage, fallbackFilename) {
  const response = await fetch(buildUrl(path), {
    headers: finalAppConfig.apiKey ? { 'X-API-Key': finalAppConfig.apiKey } : {},
  });

  if (!response.ok) {
    let message = response.statusText || fallbackMessage;

    try {
      const data = await response.json();
      message = data?.detail?.[0]?.msg || data?.message || message;
    } catch {
      // Ignore parse errors and keep fallback message.
    }

    throw new ApiError(message, { status: response.status, data: null });
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  return { blob, filename };
}

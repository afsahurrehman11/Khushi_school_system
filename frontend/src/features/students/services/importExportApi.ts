// ===================== Student Import / Export API Service =====================

import { apiCall, getAuthHeaders } from '../../../utils/api';
import API_BASE_URL from '../../../config';
import type {
  ImportPreviewResponse,
  ImportConfirmResponse,
  ImportStatusResponse,
  ImportLogEntry,
} from '../types/importExport';

const BASE = '/api/students-import-export';

/**
 * Download the sample Excel template.
 */
export async function downloadSampleTemplate(): Promise<void> {
  const response = await apiCall(`${BASE}/sample-template`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Download failed' }));
    throw new Error(err.detail || 'Download failed');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students_import_template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Upload an Excel file for validation & preview (no DB writes).
 */
export async function uploadForPreview(
  file: File,
  duplicateAction: string = 'skip'
): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('duplicate_action', duplicateAction);

  const response = await apiCall(`${BASE}/upload`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }

  return response.json();
}

/**
 * Confirm and execute import after preview.
 */
export async function confirmImport(importId: string): Promise<ImportConfirmResponse> {
  const response = await apiCall(`${BASE}/confirm/${importId}`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Confirm failed' }));
    throw new Error(err.detail || 'Confirm failed');
  }

  return response.json();
}

/**
 * Poll import status.
 */
export async function getImportStatus(importId: string): Promise<ImportStatusResponse> {
  const response = await apiCall(`${BASE}/status/${importId}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Status check failed' }));
    throw new Error(err.detail || 'Status check failed');
  }
  return response.json();
}

/**
 * Download error report.
 */
export async function downloadErrorReport(importId: string): Promise<void> {
  const response = await apiCall(`${BASE}/error-report/${importId}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Download failed' }));
    throw new Error(err.detail || 'Download failed');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'students_import_errors.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Export students as Excel.
 */
export async function exportStudents(classId?: string, section?: string): Promise<void> {
  const params = new URLSearchParams();
  if (classId) params.set('class_id', classId);
  if (section) params.set('section', section);

  const qs = params.toString();
  const url = `${BASE}/export${qs ? `?${qs}` : ''}`;

  const response = await apiCall(url);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Export failed' }));
    throw new Error(err.detail || 'Export failed');
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  const today = new Date().toISOString().split('T')[0];
  a.download = `students_${today}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

/**
 * Get import history.
 */
export async function getImportHistory(): Promise<ImportLogEntry[]> {
  const response = await apiCall(`${BASE}/history`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Failed to load history' }));
    throw new Error(err.detail || 'Failed to load history');
  }
  return response.json();
}

/**
 * Create an SSE EventSource for real-time import notifications.
 * Returns the EventSource instance so the caller can close it.
 */
export function createNotificationStream(
  onMessage: (data: any) => void,
  onError?: (err: Event) => void
): EventSource {
  const token = localStorage.getItem('token');
  // EventSource doesn't support custom headers, so we pass the token as a query param.
  // The backend SSE endpoint also accepts token via Depends(get_current_user) using
  // the standard Authorization header. For SSE we'll use a polling fallback instead.
  // We'll use a custom fetch-based SSE reader.

  const url = `${API_BASE_URL}${BASE}/notifications/stream`;

  // Use native EventSource with a workaround: we'll add a polyfill-like approach
  // For simplicity in Electron, we use fetch-based SSE:
  const abortController = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onMessage(data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError?.(err);
      }
    }
  })();

  // Return a pseudo EventSource with a close method
  return {
    close: () => abortController.abort(),
  } as unknown as EventSource;
}

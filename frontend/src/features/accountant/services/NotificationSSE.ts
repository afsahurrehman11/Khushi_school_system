// SSE client to receive server-sent notifications and forward to InAppNotificationService
import { InAppNotificationService } from './InAppNotificationService';
import API_BASE_URL from '../../../config';

const API_BASE = API_BASE_URL;

function handlePayload(raw: string) {
  try {
    const payload = JSON.parse(raw);
    const t = payload.type || 'info';
    const msg = payload.message || payload.msg || String(payload);
    if (t === 'success') InAppNotificationService.success(msg);
    else if (t === 'error') InAppNotificationService.error(msg);
    else InAppNotificationService.info(msg);
  } catch (err) {
    InAppNotificationService.info(raw);
  }
}

export function startNotificationSSE(): () => void {
  const token = localStorage.getItem('token');
  const url = `${API_BASE}/api/notifications/stream`;

  const controller = new AbortController();
  let stopped = false;

  (async () => {
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        // fallback: try EventSource without auth (may fail on protected endpoints)
        // eslint-disable-next-line no-console
        console.warn('SSE stream fetch failed', resp.status);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!chunk) continue;
          // parse SSE fields; only handle 'data:' lines (may be multi-line)
          const lines = chunk.split(/\r?\n/);
          const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.replace(/^data:\s?/, ''));
          if (dataLines.length === 0) continue;
          const data = dataLines.join('\n');
          handlePayload(data);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('SSE fetch error', e);
    }
  })();

  const stop = () => {
    stopped = true;
    try { controller.abort(); } catch (e) { /* ignore */ }
  };

  return stop;
}

export default startNotificationSSE;

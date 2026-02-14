import api from '../../../utils/api';

type Notification = { id: string; type: 'success' | 'error' | 'info'; message: string; created_at: string };

class InAppNotificationServiceClass {
  private listeners: ((n: Notification) => void)[] = [];

  private make(id: string, type: Notification['type'], message: string) {
    return { id, type, message, created_at: new Date().toISOString() };
  }

  onNotify(cb: (n: Notification) => void) {
    this.listeners.push(cb);
    return () => { this.listeners = this.listeners.filter(l => l !== cb); };
  }

  private emit(n: Notification) {
    for (const l of this.listeners) l(n);
  }

  private async persistRemote(n: { type: string; title?: string; message: string; user_email?: string }) {
    // Only persist to backend if notifications are enabled via env flag.
    if (import.meta.env.VITE_ENABLE_NOTIFICATIONS !== 'true') return;
    try {
      // Try to persist notification to backend notifications endpoint
      await api.post('/api/notifications', {
        user_email: n.user_email || (JSON.parse(localStorage.getItem('user') || '{}').email || ''),
        type: n.type,
        channel: 'in-app',
        title: n.title || '',
        message: n.message,
      });
    } catch (e) {
      // ignore persistence failures
    }
  }

  success(message: string) {
    const n = this.make(String(Date.now()), 'success', message);
    this.emit(n);
    this.persistRemote({ type: 'success', message });
    return n;
  }
  error(message: string) {
    const n = this.make(String(Date.now()), 'error', message);
    this.emit(n);
    this.persistRemote({ type: 'error', message });
    return n;
  }
  info(message: string) {
    const n = this.make(String(Date.now()), 'info', message);
    this.emit(n);
    this.persistRemote({ type: 'info', message });
    return n;
  }
}

export const InAppNotificationService = new InAppNotificationServiceClass();
export type { Notification };

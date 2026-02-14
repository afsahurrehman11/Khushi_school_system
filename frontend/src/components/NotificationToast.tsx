import React, { useEffect, useState } from 'react';
import { InAppNotificationService, Notification } from '../features/accountant/services/InAppNotificationService';

const NotificationToast: React.FC = () => {
  const [toasts, setToasts] = useState<Notification[]>([]);

  useEffect(() => {
    const off = InAppNotificationService.onNotify((n: Notification) => {
      setToasts(prev => [n, ...prev]);
      // auto-remove after 4s
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== n.id));
      }, 4000);
    });

    return () => off();
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`max-w-sm w-full rounded shadow p-3 border-l-4 ${t.type === 'success' ? 'bg-green-50 border-green-500' : t.type === 'error' ? 'bg-red-50 border-red-500' : 'bg-blue-50 border-blue-500'}`}>
          <div className="text-sm font-medium text-secondary-900">{t.message}</div>
          <div className="text-xs text-secondary-500 mt-1">{new Date(t.created_at).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  );
};

export default NotificationToast;

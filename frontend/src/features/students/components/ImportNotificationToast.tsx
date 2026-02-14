import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, X, Bell } from 'lucide-react';
import type { ImportNotification } from '../types/importExport';
import { createNotificationStream } from '../services/importExportApi';

interface ImportNotificationToastProps {
  /** Called when user clicks the notification to view import details */
  onViewImport?: (importId: string) => void;
}

interface ToastItem {
  id: string;
  notification: ImportNotification;
  visible: boolean;
}

const ImportNotificationToast: React.FC<ImportNotificationToastProps> = ({ onViewImport }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((notification: ImportNotification) => {
    if (notification.type === 'connected') return;

    const id = `${notification.import_id}-${Date.now()}`;
    setToasts((prev) => [...prev, { id, notification, visible: true }]);

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 500);
    }, 15000);
  }, []);

  useEffect(() => {
    // Check if user is Admin
    const userStr = localStorage.getItem('user');
    if (!userStr) return;

    try {
      const user = JSON.parse(userStr);
      const role = typeof user.role === 'string' ? user.role : user.role?.name || '';
      if (role !== 'Admin') return;
    } catch {
      return;
    }

    const stream = createNotificationStream(
      (data) => {
        addToast(data as ImportNotification);
      },
      () => {
        // Silently ignore SSE errors (will reconnect on next mount)
      }
    );

    return () => {
      stream.close();
    };
  }, [addToast]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  };

  const handleClick = (toast: ToastItem) => {
    if (toast.notification.import_id) {
      onViewImport?.(toast.notification.import_id);
    }
    dismissToast(toast.id);
  };

  const getStatusStyles = (status?: string) => {
    switch (status) {
      case 'completed':
        return {
          bg: 'bg-success-50 border-success-300',
          icon: <CheckCircle2 className="w-6 h-6 text-success-600" />,
          title: 'Import Completed',
        };
      case 'completed_with_errors':
        return {
          bg: 'bg-warning-50 border-warning-300',
          icon: <AlertTriangle className="w-6 h-6 text-warning-600" />,
          title: 'Completed With Errors',
        };
      case 'failed':
        return {
          bg: 'bg-danger-50 border-danger-300',
          icon: <XCircle className="w-6 h-6 text-danger-600" />,
          title: 'Import Failed',
        };
      default:
        return {
          bg: 'bg-primary-50 border-primary-300',
          icon: <Bell className="w-6 h-6 text-primary-600" />,
          title: 'Import Update',
        };
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.filter((t) => t.visible).map((toast) => {
          const styles = getStatusStyles(toast.notification.status);
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className={`
                pointer-events-auto w-96 rounded-xl border shadow-lg
                ${styles.bg}
                cursor-pointer hover:shadow-xl transition-shadow
              `}
              onClick={() => handleClick(toast)}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-secondary-900 text-sm">
                      {styles.title}
                    </p>
                    <p className="text-sm text-secondary-600 mt-1">
                      {toast.notification.message || 'Import process updated.'}
                    </p>
                    {toast.notification.file_name && (
                      <p className="text-xs text-secondary-500 mt-1 truncate">
                        File: {toast.notification.file_name}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissToast(toast.id);
                    }}
                    className="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors"
                  >
                    <X className="w-4 h-4 text-secondary-400" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ImportNotificationToast;

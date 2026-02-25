import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import type { ImportLogEntry } from '../types/importExport';
import { getImportHistory } from '../services/importExportApi';

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  completed: {
    icon: <CheckCircle2 className="w-4 h-4 text-success-600" />,
    color: 'success',
    label: 'Completed',
  },
  completed_with_errors: {
    icon: <AlertTriangle className="w-4 h-4 text-warning-600" />,
    color: 'warning',
    label: 'Completed with Errors',
  },
  failed: {
    icon: <XCircle className="w-4 h-4 text-danger-600" />,
    color: 'danger',
    label: 'Failed',
  },
  processing: {
    icon: <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />,
    color: 'primary',
    label: 'Processing',
  },
  pending: {
    icon: <Clock className="w-4 h-4 text-secondary-500" />,
    color: 'secondary',
    label: 'Pending',
  },
};

const ImportHistoryModal: React.FC<ImportHistoryModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ImportLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getImportHistory();
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load import history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import History" size="xl">
      <div className="space-y-4">
        {/* Header with refresh */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-secondary-500">
            {logs.length} import{logs.length !== 1 ? 's' : ''} found
          </p>
          <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-200 rounded-lg p-4 text-sm text-danger-700">
            {error}
          </div>
        )}

        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-secondary-500">
            <History className="w-12 h-12 mb-3 opacity-40" />
            <p>No import history yet</p>
          </div>
        ) : (
          <div className="border border-secondary-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-sm">
                <thead className="bg-secondary-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-secondary-600 font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-secondary-600 font-medium">File Name</th>
                    <th className="px-4 py-3 text-left text-secondary-600 font-medium">Imported By</th>
                    <th className="px-4 py-3 text-left text-secondary-600 font-medium">Date</th>
                    <th className="px-4 py-3 text-center text-secondary-600 font-medium">Total</th>
                    <th className="px-4 py-3 text-center text-secondary-600 font-medium">Success</th>
                    <th className="px-4 py-3 text-center text-secondary-600 font-medium">Failed</th>
                    <th className="px-4 py-3 text-center text-secondary-600 font-medium">Duplicates</th>
                    <th className="px-4 py-3 text-center text-secondary-600 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {logs.map((log) => {
                    const config = statusConfig[log.status] || statusConfig.pending;
                    return (
                      <motion.tr
                        key={log.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-secondary-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {config.icon}
                            <Badge
                              label={config.label}
                              color={config.color as any}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-secondary-900 max-w-[180px] truncate">
                          {log.file_name}
                        </td>
                        <td className="px-4 py-3 text-secondary-700">
                          {log.imported_by_name || log.imported_by}
                        </td>
                        <td className="px-4 py-3 text-secondary-500 whitespace-nowrap">
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="px-4 py-3 text-center text-secondary-900 font-medium">
                          {log.total_rows}
                        </td>
                        <td className="px-4 py-3 text-center text-success-700 font-medium">
                          {log.successful_rows}
                        </td>
                        <td className="px-4 py-3 text-center text-danger-700 font-medium">
                          {log.failed_rows}
                        </td>
                        <td className="px-4 py-3 text-center text-warning-700 font-medium">
                          {log.duplicate_count}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {/* Error download removed - errors shown inline */}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ImportHistoryModal;

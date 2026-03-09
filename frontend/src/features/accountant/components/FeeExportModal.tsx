import React from 'react';
import ReactDOM from 'react-dom';
import { X, Download, Loader2 } from 'lucide-react';
import Button from '../../../components/Button';

type FeeStatus = 'paid' | 'partial' | 'unpaid' | null;

interface FeeExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStatus: FeeStatus;
  onStatusChange: (status: FeeStatus) => void;
  onExport: () => void;
  exporting: boolean;
}

const FeeExportModal: React.FC<FeeExportModalProps> = ({
  isOpen,
  onClose,
  selectedStatus,
  onStatusChange,
  onExport,
  exporting,
}) => {
  // Container ref for portal target — create once on mount
  const containerId = 'fee-export-modal-root';
  const containerRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) {
      const existing = document.getElementById(containerId) as HTMLElement | null;
      if (existing) containerRef.current = existing;
      else {
        const el = document.createElement('div');
        el.id = containerId;
        document.body.appendChild(el);
        containerRef.current = el;
      }
    }
  }, []);

  if (!isOpen) return null;

  const modalContent = (
    // Use a very high inline z-index to avoid stacking context issues
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 99999, display: 'flex' }}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border-4 border-pink-500">
        {/* Header */}
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Export Fee Report</h3>
          <button
            onClick={onClose}
            disabled={exporting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Selection */}
        <div className="space-y-3 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select fee status to export:
          </label>
          
          <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                 style={{ borderColor: selectedStatus === 'paid' ? '#10b981' : '#e5e7eb' }}>
            <input
              type="radio"
              name="status"
              value="paid"
              checked={selectedStatus === 'paid'}
              onChange={(e) => onStatusChange(e.target.value as FeeStatus)}
              disabled={exporting}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="ml-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full"></span>
              <span className="font-medium text-gray-900">Paid Students</span>
            </span>
          </label>

          <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                 style={{ borderColor: selectedStatus === 'partial' ? '#f59e0b' : '#e5e7eb' }}>
            <input
              type="radio"
              name="status"
              value="partial"
              checked={selectedStatus === 'partial'}
              onChange={(e) => onStatusChange(e.target.value as FeeStatus)}
              disabled={exporting}
              className="w-4 h-4 text-amber-600 focus:ring-amber-500"
            />
            <span className="ml-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
              <span className="font-medium text-gray-900">Partial Payment Students</span>
            </span>
          </label>

          <label className="flex items-center p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                 style={{ borderColor: selectedStatus === 'unpaid' ? '#ef4444' : '#e5e7eb' }}>
            <input
              type="radio"
              name="status"
              value="unpaid"
              checked={selectedStatus === 'unpaid'}
              onChange={(e) => onStatusChange(e.target.value as FeeStatus)}
              disabled={exporting}
              className="w-4 h-4 text-red-600 focus:ring-red-500"
            />
            <span className="ml-3 flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="font-medium text-gray-900">Unpaid Students</span>
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={exporting}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onExport}
            disabled={!selectedStatus || exporting}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, containerRef.current || document.getElementById(containerId) || document.body);

};

export default FeeExportModal;

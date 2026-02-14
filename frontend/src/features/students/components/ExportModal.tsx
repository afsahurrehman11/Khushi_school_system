import React, { useState } from 'react';
import { Download, Loader2, FileSpreadsheet } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { exportStudents } from '../services/importExportApi';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes?: string[];
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const [classFilter, setClassFilter] = useState<string>('');
  const [sectionFilter, setSectionFilter] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await exportStudents(
        classFilter || undefined,
        sectionFilter || undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Students" size="md">
      <div className="space-y-6">
        <div className="flex items-center gap-4 p-4 bg-primary-50 rounded-xl">
          <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-secondary-900">Excel Export</p>
            <p className="text-sm text-secondary-500">
              Export student data matching the template format
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-secondary-700">Filters (optional)</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary-600 mb-1">Class</label>
              <input
                type="text"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                placeholder="e.g. Grade-5"
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm text-secondary-600 mb-1">Section</label>
              <input
                type="text"
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                placeholder="e.g. A"
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Students
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ExportModal;

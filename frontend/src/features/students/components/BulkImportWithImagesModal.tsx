import React, { useState } from 'react';
import { Loader2, Upload, Info } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { getAuthHeaders } from '../../../utils/api';
import { config } from '../../../config';

interface BulkImportWithImagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

const BulkImportWithImagesModal: React.FC<BulkImportWithImagesModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [classId, setClassId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!excelFile) {
      setError('Please select an Excel file');
      return;
    }

    if (!classId.trim()) {
      setError('Please select a class');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('class_id', classId);
      formData.append('file', excelFile);
      if (zipFile) {
        formData.append('images', zipFile);
      }

      const response = await fetch(
        `${config.API_BASE_URL}/students/import-with-images`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Import failed');
      }

      const data = await response.json();
      setResult(data);
      onImportComplete?.();
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      setExcelFile(null);
      setZipFile(null);
      setClassId('');
      setError(null);
      setResult(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  // Show result
  if (result) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title="Import Summary" size="sm">
        <div className="space-y-4">
          {result.summary && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-600">
                  {result.summary.total_students_created}
                </p>
                <p className="text-xs text-green-700">Students Created</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">
                  {result.summary.images_uploaded}
                </p>
                <p className="text-xs text-blue-700">Images Uploaded</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-600">
                  {result.summary.failed_students}
                </p>
                <p className="text-xs text-red-700">Students Failed</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-orange-600">
                  {result.summary.image_failures}
                </p>
                <p className="text-xs text-orange-700">Image Failures</p>
              </div>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="max-h-40 overflow-y-auto border border-red-200 rounded-lg p-3 bg-red-50">
              <p className="text-sm font-medium text-red-900 mb-2">Errors:
              </p>
              <ul className="space-y-1">
                {result.errors.slice(0, 10).map((err: any, idx: number) => (
                  <li key={idx} className="text-xs text-red-700">
                    Row {err.row}: {err.error}
                  </li>
                ))}
              </ul>
              {result.errors.length > 10 && (
                <p className="text-xs text-red-700 mt-2">
                  ... and {result.errors.length - 10} more errors
                </p>
              )}
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={handleClose}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Bulk Import with Images" size="lg">
      <form onSubmit={handleImport} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Excel should have columns: name, father_name, parent_cnic, registration_id, section, subjects
            <br />
            ZIP should contain images named with student registration IDs (e.g., 0000-001.jpg)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Class ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            placeholder="e.g., 9-A"
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            Excel File (.xlsx) <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
          {excelFile && (
            <p className="text-xs text-secondary-600 mt-1">
              Selected: {excelFile.name}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-secondary-700 mb-2">
            ZIP File (Images) - Optional
          </label>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setZipFile(e.target.files?.[0] || null)}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
          {zipFile && (
            <p className="text-xs text-secondary-600 mt-1">
              Selected: {zipFile.name}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
          <Button
            variant="ghost"
            type="button"
            onClick={handleClose}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default BulkImportWithImagesModal;

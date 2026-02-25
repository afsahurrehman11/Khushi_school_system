import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Loader2,
  X,
  Info,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import type { ImportPreviewResponse, ImportError } from '../types/importExport';
import {
  uploadForPreview,
  confirmImport,
  getImportStatus,
} from '../services/importExportApi';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: (importId: string) => void;
}

type Step = 'upload' | 'preview' | 'processing' | 'result';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImportComplete }) => {
  const [step, setStep] = useState<Step>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update'>('skip');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    successful_rows: number;
    failed_rows: number;
    import_id: string;
    errors: ImportError[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const validateZip = (f: File): string | null => {
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.zip') return 'Invalid file type. Only .zip files are accepted.';
    const MAX_ZIP = 50 * 1024 * 1024; // 50MB
    if (f.size > MAX_ZIP) return 'ZIP file exceeds maximum size of 50MB.';
    return null;
  };

  const resetState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setError(null);
    setPreview(null);
    setResult(null);
    setConfirming(false);
    setUploading(false);
    setDragOver(false);
    setDuplicateAction('skip');
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  // ---- File validation ----
  const validateFile = (f: File): string | null => {
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return 'Invalid file type. Only .xlsx / .xls files are accepted.';
    }
    if (f.size > MAX_FILE_SIZE) {
      return 'File exceeds maximum size of 10MB.';
    }
    return null;
  };

  // ---- Drag & Drop ----
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setError(null);

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    const validationError = validateFile(droppedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(droppedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validationError = validateFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(selectedFile);
  };

  const handleZipSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selected = e.target.files?.[0];
    if (!selected) return;

    const validationError = validateZip(selected);
    if (validationError) {
      setError(validationError);
      return;
    }
    setZipFile(selected);
    logger.info('IMPORT', `🟡 [IMPORT] ZIP selected: ${selected.name}`);
  };

  // ---- Upload & Preview ----
  const handleUpload = async () => {
    if (!file) return;
    logger.info('IMPORT', `📊 Uploading file for preview: ${file.name} (${file.size} bytes)`);
    setUploading(true);
    setError(null);

    try {
      const res = await uploadForPreview(file, duplicateAction, zipFile);
      logger.info('IMPORT', `✅ Preview generated: ${res.total_rows ?? res.preview_data?.length ?? 0} rows`);
      setPreview(res);
      setStep('preview');
    } catch (err: any) {
      logger.error('IMPORT', `❌ Upload failed: ${String(err)}`);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ---- Confirm Import ----
  const handleConfirm = async () => {
    if (!preview) return;
    logger.info('IMPORT', `🚀 Starting import confirmation for import ID: ${preview.import_id}`);
    setConfirming(true);
    setStep('processing');

    try {
      await confirmImport(preview.import_id);

      // Poll for status
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max
      const poll = async () => {
        while (attempts < maxAttempts) {
          attempts++;
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const status = await getImportStatus(preview.import_id);
            if (status.status !== 'processing' && status.status !== 'pending') {
              logger.info('IMPORT', `✅ Import completed: ${status.successful_rows} successful, ${status.failed_rows} failed`);
              setResult({
                status: status.status,
                successful_rows: status.successful_rows,
                failed_rows: status.failed_rows,
                import_id: preview.import_id,
                errors: status.errors || [],
              });
              setStep('result');
              onImportComplete?.(preview.import_id);
              return;
            }
          } catch {
            // continue polling
          }
        }
        // Timeout
        logger.error('IMPORT', '⏰ Import timed out after 2 minutes');
        setResult({
          status: 'timeout',
          successful_rows: 0,
          failed_rows: 0,
          import_id: preview.import_id,
          errors: [],
        });
        setStep('result');
      };
      await poll();
    } catch (err: any) {
      logger.error('IMPORT', `❌ Import failed: ${String(err)}`);
      setError(err.message || 'Import failed');
      setStep('preview');
    } finally {
      setConfirming(false);
    }
  };

  // ---- Render steps ----
  const renderUploadStep = () => (
    <div className="space-y-6">
      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${dragOver
            ? 'border-primary-500 bg-primary-50 scale-[1.02]'
            : file
              ? 'border-success-400 bg-success-50'
              : 'border-secondary-300 bg-secondary-50 hover:border-primary-400 hover:bg-primary-50/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
        />

        {file ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
              <FileSpreadsheet className="w-8 h-8 text-success-600" />
            </div>
            <div>
              <p className="font-semibold text-secondary-900">{file.name}</p>
              <p className="text-sm text-secondary-500">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
              className="text-sm text-danger-600 hover:text-danger-700 flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary-600" />
            </div>
            <div>
              <p className="font-semibold text-secondary-900">
                Drag & drop your Excel file here
              </p>
              <p className="text-sm text-secondary-500">
                or click to browse • .xlsx / .xls • Max 10MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Duplicate handling option */}
      <div className="bg-secondary-50 rounded-xl p-4">
        <p className="text-sm font-medium text-secondary-700 mb-3 flex items-center gap-2">
          <Copy className="w-4 h-4" />
          Duplicate Handling
        </p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="duplicateAction"
              value="skip"
              checked={duplicateAction === 'skip'}
              onChange={() => setDuplicateAction('skip')}
              className="text-primary-600"
            />
            <span className="text-sm text-secondary-700">Skip duplicates (default)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="duplicateAction"
              value="update"
              checked={duplicateAction === 'update'}
              onChange={() => setDuplicateAction('update')}
              className="text-primary-600"
            />
            <span className="text-sm text-secondary-700">Update existing records</span>
          </label>
        </div>
      </div>

      {/* ZIP upload */}
      <div className="bg-secondary-50 rounded-xl p-4">
        <p className="text-sm font-medium text-secondary-700 mb-3 flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Optional ZIP with images (max 50MB)
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={zipInputRef}
            type="file"
            accept=".zip"
            onChange={handleZipSelect}
            className="hidden"
          />
          <Button variant="secondary" onClick={() => zipInputRef.current?.click()}>
            Select ZIP
          </Button>
          {zipFile && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-secondary-700">{zipFile.name}</p>
              <button
                onClick={() => setZipFile(null)}
                className="text-sm text-danger-600 hover:text-danger-700"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-danger-50 border border-danger-200 rounded-lg p-4 flex items-start gap-3"
        >
          <XCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-danger-800">{error}</p>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload & Validate
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderPreviewStep = () => {
    if (!preview) return null;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-secondary-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-secondary-900">{preview.total_rows}</p>
            <p className="text-sm text-secondary-500">Total Rows</p>
          </div>
          <div className="bg-success-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-success-700">{preview.valid_rows}</p>
            <p className="text-sm text-success-600">Valid Rows</p>
          </div>
          <div className="bg-danger-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-danger-700">{preview.error_rows}</p>
            <p className="text-sm text-danger-600">Error Rows</p>
          </div>
          <div className="bg-warning-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-warning-700">{preview.duplicate_rows}</p>
            <p className="text-sm text-warning-600">Duplicates</p>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-primary-800">
            <p className="font-medium">No data has been saved yet.</p>
            <p>Review the preview below, then click "Confirm Import" to proceed.</p>
            {duplicateAction === 'update' && (
              <p className="mt-1 text-primary-600">
                Duplicates will be <strong>updated</strong> with new data.
              </p>
            )}
          </div>
        </div>

        {/* Preview Table */}
        {preview.preview_data.length > 0 && (
          <div className="border border-secondary-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-secondary-50 border-b border-secondary-200">
              <p className="font-medium text-secondary-700">
                Preview (first {preview.preview_data.length} valid rows)
              </p>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-sm">
                <thead className="bg-secondary-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-secondary-600">Student ID</th>
                    <th className="px-3 py-2 text-left text-secondary-600">Full Name</th>
                    <th className="px-3 py-2 text-left text-secondary-600">Roll No</th>
                    <th className="px-3 py-2 text-left text-secondary-600">Class</th>
                    <th className="px-3 py-2 text-left text-secondary-600">Section</th>
                    <th className="px-3 py-2 text-left text-secondary-600">Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-100">
                  {preview.preview_data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-secondary-50">
                      <td className="px-3 py-2 text-secondary-900">{row.registration_number}</td>
                      <td className="px-3 py-2 text-secondary-900">{row.full_name}</td>
                      <td className="px-3 py-2 text-secondary-900">{row.roll_number}</td>
                      <td className="px-3 py-2 text-secondary-900">{row.class_id}</td>
                      <td className="px-3 py-2 text-secondary-900">{row.section}</td>
                      <td className="px-3 py-2 text-secondary-900">{row.gender}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Errors Table */}
        {preview.errors.length > 0 && (
          <div className="border border-danger-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-danger-50 border-b border-danger-200">
              <p className="font-medium text-danger-700">
                Errors ({preview.errors.length})
              </p>
            </div>
            <div className="overflow-x-auto max-h-48">
              <table className="w-full text-sm">
                <thead className="bg-danger-50/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-danger-600">Row</th>
                    <th className="px-3 py-2 text-left text-danger-600">Column</th>
                    <th className="px-3 py-2 text-left text-danger-600">Value</th>
                    <th className="px-3 py-2 text-left text-danger-600">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-danger-100">
                  {preview.errors.slice(0, 50).map((err, idx) => (
                    <tr key={idx} className="hover:bg-danger-50/30">
                      <td className="px-3 py-2 text-secondary-900">{err.row}</td>
                      <td className="px-3 py-2 text-secondary-900">{err.column}</td>
                      <td className="px-3 py-2 text-secondary-600 max-w-[150px] truncate">{err.value || '—'}</td>
                      <td className="px-3 py-2 text-danger-700">{err.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <Button variant="secondary" onClick={() => { resetState(); }}>
            ← Upload Different File
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={handleConfirm}
              disabled={preview.valid_rows === 0 || confirming}
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm Import ({preview.valid_rows} students)
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderProcessingStep = () => (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="relative">
        <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-primary-600 animate-spin" />
        </div>
      </div>
      <div className="text-center">
        <h3 className="text-xl font-semibold text-secondary-900 mb-2">
          Import in Progress
        </h3>
        <p className="text-secondary-600">
          Import started. You will receive a notification when the process completes.
        </p>
        <p className="text-sm text-secondary-500 mt-2">
          Processing {preview?.valid_rows || 0} student records...
        </p>
      </div>
    </div>
  );

  const renderResultStep = () => {
    if (!result) return null;

    const isSuccess = result.status === 'completed';
    const hasErrors = result.status === 'completed_with_errors';
    const isFailed = result.status === 'failed' || result.status === 'timeout';
    const showErrors = (hasErrors || isFailed) && result.errors && result.errors.length > 0;

    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-6">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
          isSuccess ? 'bg-success-100' : hasErrors ? 'bg-warning-100' : 'bg-danger-100'
        }`}>
          {isSuccess ? (
            <CheckCircle2 className="w-10 h-10 text-success-600" />
          ) : hasErrors ? (
            <AlertTriangle className="w-10 h-10 text-warning-600" />
          ) : (
            <XCircle className="w-10 h-10 text-danger-600" />
          )}
        </div>

        <div className="text-center">
          <h3 className={`text-xl font-semibold mb-2 ${
            isSuccess ? 'text-success-700' : hasErrors ? 'text-warning-700' : 'text-danger-700'
          }`}>
            {isSuccess ? 'Import Completed' : hasErrors ? 'Completed With Errors' : 'Import Failed'}
          </h3>
          <p className="text-secondary-600">
            {isSuccess
              ? `${result.successful_rows} students imported successfully.`
              : hasErrors
                ? `${result.successful_rows} students imported successfully. ${result.failed_rows} failed.`
                : isFailed && result.errors?.length > 0
                  ? 'The import was cancelled. No students were imported.'
                  : 'The import could not be completed.'}
          </p>
        </div>

        {/* Inline Error Display */}
        {showErrors && (
          <div className="w-full max-w-lg bg-danger-50 border border-danger-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-danger-800 mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              Errors ({result.errors.length})
            </h4>
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {result.errors.slice(0, 10).map((err, index) => (
                <li key={index} className="text-sm text-danger-700 bg-white rounded px-3 py-2 border border-danger-100">
                  {err.row > 0 && <span className="font-medium">Row {err.row}: </span>}
                  {err.reason}
                </li>
              ))}
              {result.errors.length > 10 && (
                <li className="text-sm text-danger-600 italic">
                  ...and {result.errors.length - 10} more errors
                </li>
              )}
            </ul>
          </div>
        )}

        <Button variant="primary" onClick={handleClose}>
          Done
        </Button>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        step === 'upload'
          ? 'Import Students'
          : step === 'preview'
            ? 'Review Import'
            : step === 'processing'
              ? 'Processing Import'
              : 'Import Results'
      }
      size="xl"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'processing' && renderProcessingStep()}
          {step === 'result' && renderResultStep()}
        </motion.div>
      </AnimatePresence>
    </Modal>
  );
};

export default ImportModal;

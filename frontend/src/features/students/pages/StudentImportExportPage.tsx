import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  FileSpreadsheet,
  History,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Info,
  Image,
  AlertCircle,
  Users,
  ChevronDown,
  ChevronRight,
  Edit2,
  Save,
} from 'lucide-react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import logger from '../../../utils/logger';
import type { 
  ImportPreviewResponse, 
  IncompleteStudentsResponse,
  IncompleteStudent,
} from '../types/importExport';
import { MISSING_FIELD_LABELS } from '../types/importExport';
import {
  uploadForPreview,
  confirmImport,
  getImportStatus,
  downloadSampleTemplate,
  exportStudents,
  getImportHistory,
  getIncompleteStudents,
  updateIncompleteStudent,
} from '../services/importExportApi';

type TabType = 'import-export' | 'incomplete';
type ImportStep = 'upload' | 'preview' | 'processing' | 'result';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ZIP_SIZE = 50 * 1024 * 1024; // 50 MB

const StudentImportExportPage: React.FC = () => {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('import-export');
  
  // Import state
  const [step, setStep] = useState<ImportStep>('upload');
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
  } | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // History modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Incomplete students state
  const [incompleteData, setIncompleteData] = useState<IncompleteStudentsResponse | null>(null);
  const [incompleteLoading, setIncompleteLoading] = useState(false);
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingStudent, setSavingStudent] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  // Load incomplete data when tab changes
  useEffect(() => {
    if (activeTab === 'incomplete') {
      loadIncompleteStudents();
    }
  }, [activeTab]);

  const loadIncompleteStudents = async () => {
    setIncompleteLoading(true);
    try {
      const data = await getIncompleteStudents();
      setIncompleteData(data);
      // Expand first class by default
      if (data.classes.length > 0) {
        setExpandedClasses(new Set([data.classes[0].class_id]));
      }
    } catch (err: any) {
      logger.error('INCOMPLETE', err.message);
    } finally {
      setIncompleteLoading(false);
    }
  };

  const validateFile = (f: File): string | null => {
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      return 'Please upload an Excel file (.xlsx or .xls)';
    }
    if (f.size > MAX_FILE_SIZE) {
      return 'File is too large. Maximum size is 10MB.';
    }
    return null;
  };

  const validateZip = (f: File): string | null => {
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.zip') return 'Please upload a ZIP file for images';
    if (f.size > MAX_ZIP_SIZE) return 'ZIP file is too large. Maximum size is 50MB.';
    return null;
  };

  const resetImportState = useCallback(() => {
    setStep('upload');
    setFile(null);
    setZipFile(null);
    setError(null);
    setPreview(null);
    setResult(null);
    setConfirming(false);
    setUploading(false);
    setDragOver(false);
    setDuplicateAction('skip');
  }, []);

  // Drag & Drop handlers
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

    const files = Array.from(e.dataTransfer.files);
    
    for (const droppedFile of files) {
      const ext = droppedFile.name.substring(droppedFile.name.lastIndexOf('.')).toLowerCase();
      
      if (['.xlsx', '.xls'].includes(ext)) {
        const validationError = validateFile(droppedFile);
        if (validationError) {
          setError(validationError);
        } else {
          setFile(droppedFile);
        }
      } else if (ext === '.zip') {
        const validationError = validateZip(droppedFile);
        if (validationError) {
          setError(validationError);
        } else {
          setZipFile(droppedFile);
        }
      }
    }
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
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const res = await uploadForPreview(file, duplicateAction, zipFile);
      setPreview(res);
      setStep('preview');
    } catch (err: any) {
      // Check for missing columns error
      const errorMsg = err.message || 'Upload failed';
      if (errorMsg.includes('missing')) {
        setError(errorMsg);
      } else {
        setError(errorMsg);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    setStep('processing');

    try {
      await confirmImport(preview.import_id);

      // Poll for status
      let attempts = 0;
      const maxAttempts = 120;
      
      while (attempts < maxAttempts) {
        attempts++;
        await new Promise((r) => setTimeout(r, 2000));
        
        const status = await getImportStatus(preview.import_id);
        if (status.status !== 'processing' && status.status !== 'pending') {
          setResult({
            status: status.status,
            successful_rows: status.successful_rows,
            failed_rows: status.failed_rows,
            import_id: preview.import_id,
          });
          setStep('result');
          return;
        }
      }
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setStep('upload');
    } finally {
      setConfirming(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadSampleTemplate();
    } catch (err: any) {
      setError(err.message || 'Failed to download template');
    } finally {
      setDownloading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportStudents();
    } catch (err: any) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleViewHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const logs = await getImportHistory();
      setHistoryData(logs);
    } catch (err: any) {
      logger.error('HISTORY', err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Incomplete students handlers
  const toggleClassExpand = (classId: string) => {
    const newExpanded = new Set(expandedClasses);
    if (newExpanded.has(classId)) {
      newExpanded.delete(classId);
    } else {
      newExpanded.add(classId);
    }
    setExpandedClasses(newExpanded);
  };

  const startEditing = (student: IncompleteStudent) => {
    setEditingStudent(student.id);
    setEditValues({
      section: student.section || '',
      gender: student.current_data.gender || '',
      date_of_birth: student.current_data.date_of_birth || '',
      father_name: student.current_data.father_name || '',
      father_cnic: student.current_data.father_cnic || '',
      parent_contact: student.current_data.parent_contact || '',
      address: student.current_data.address || '',
    });
  };

  const cancelEditing = () => {
    setEditingStudent(null);
    setEditValues({});
  };

  const saveStudentData = async (studentId: string) => {
    setSavingStudent(studentId);
    try {
      await updateIncompleteStudent(studentId, editValues);
      await loadIncompleteStudents();
      setEditingStudent(null);
      setEditValues({});
    } catch (err: any) {
      setError(err.message || 'Failed to update student');
    } finally {
      setSavingStudent(null);
    }
  };

  // Render Import/Export Tab Content
  const renderImportExportTab = () => (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Download Template */}
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
          className="bg-white rounded-xl shadow-soft p-5 cursor-pointer border border-secondary-200 hover:border-primary-300 transition-colors"
          onClick={handleDownloadTemplate}
        >
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mb-3">
            <FileSpreadsheet className="w-5 h-5 text-primary-600" />
          </div>
          <h3 className="text-base font-semibold text-secondary-900 mb-1">Download Template</h3>
          <p className="text-sm text-secondary-500">Get a sample Excel file with correct columns</p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" disabled={downloading}>
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download'}
            </Button>
          </div>
        </motion.div>

        {/* Export Students */}
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
          className="bg-white rounded-xl shadow-soft p-5 cursor-pointer border border-secondary-200 hover:border-success-300 transition-colors"
          onClick={handleExport}
        >
          <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center mb-3">
            <Download className="w-5 h-5 text-success-600" />
          </div>
          <h3 className="text-base font-semibold text-secondary-900 mb-1">Export Students</h3>
          <p className="text-sm text-secondary-500">Download all students as Excel file</p>
          <div className="mt-3">
            <Button variant="success" size="sm" disabled={exporting}>
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </Button>
          </div>
        </motion.div>

        {/* View History */}
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
          className="bg-white rounded-xl shadow-soft p-5 cursor-pointer border border-secondary-200 hover:border-warning-300 transition-colors"
          onClick={handleViewHistory}
        >
          <div className="w-10 h-10 bg-warning-100 rounded-lg flex items-center justify-center mb-3">
            <History className="w-5 h-5 text-warning-600" />
          </div>
          <h3 className="text-base font-semibold text-secondary-900 mb-1">Import History</h3>
          <p className="text-sm text-secondary-500">View past imports and error reports</p>
          <div className="mt-3">
            <Button variant="warning" size="sm">
              <History className="w-4 h-4" />
              View History
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Import Section */}
      <div className="bg-white rounded-xl shadow-soft p-6 border border-secondary-200">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary-600" />
          Import Students
        </h3>

        {/* Required Columns Info */}
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Required Columns</p>
              <p className="text-sm text-blue-700 mt-1">
                Your Excel file must have these columns: <strong>Name</strong>, <strong>Roll Number</strong>, <strong>Registration Number</strong>, <strong>Class</strong>
              </p>
              <p className="text-xs text-blue-600 mt-1">
                Column names are flexible - "Reg No", "Student ID", "Full Name" etc. are also accepted.
              </p>
            </div>
          </div>
        </div>

        {step === 'upload' && (
          <>
            {/* Error Display */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-900">Import Error</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Drag & Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                dragOver
                  ? 'border-primary-500 bg-primary-50'
                  : file
                  ? 'border-success-500 bg-success-50'
                  : 'border-secondary-300 hover:border-primary-400 hover:bg-secondary-50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {file ? (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="w-12 h-12 text-success-500 mb-3" />
                  <p className="font-medium text-secondary-900">{file.name}</p>
                  <p className="text-sm text-secondary-500 mt-1">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                  <button
                    className="mt-3 text-sm text-secondary-500 hover:text-secondary-700"
                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="w-12 h-12 text-secondary-400 mb-3" />
                  <p className="font-medium text-secondary-700">
                    Drag & drop your Excel file here
                  </p>
                  <p className="text-sm text-secondary-500 mt-1">
                    or click to browse (max 10MB)
                  </p>
                </div>
              )}
            </div>

            {/* ZIP File Upload (Optional) */}
            <div className="mt-4 p-4 bg-secondary-50 rounded-lg border border-secondary-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Image className="w-5 h-5 text-secondary-600" />
                  <div>
                    <p className="text-sm font-medium text-secondary-900">Student Photos (Optional)</p>
                    <p className="text-xs text-secondary-500">
                      Upload a ZIP file with student images named by Registration Number
                    </p>
                  </div>
                </div>
                <div>
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleZipSelect}
                    className="hidden"
                  />
                  {zipFile ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-success-600">{zipFile.name}</span>
                      <button
                        className="text-secondary-400 hover:text-secondary-600"
                        onClick={() => setZipFile(null)}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => zipInputRef.current?.click()}
                    >
                      <Image className="w-4 h-4" />
                      Add Photos ZIP
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Duplicate Action */}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm text-secondary-700">If student already exists:</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duplicateAction"
                  checked={duplicateAction === 'skip'}
                  onChange={() => setDuplicateAction('skip')}
                  className="text-primary-600"
                />
                <span className="text-sm">Skip</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="duplicateAction"
                  checked={duplicateAction === 'update'}
                  onChange={() => setDuplicateAction('update')}
                  className="text-primary-600"
                />
                <span className="text-sm">Update existing</span>
              </label>
            </div>

            {/* Upload Button */}
            <div className="mt-6 flex justify-end">
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
                    Upload & Preview
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            {/* Preview Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="p-4 bg-secondary-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-secondary-900">{preview.total_rows}</p>
                <p className="text-sm text-secondary-500">Total Rows</p>
              </div>
              <div className="p-4 bg-success-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-success-600">{preview.valid_rows}</p>
                <p className="text-sm text-success-700">Valid</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">{preview.error_rows}</p>
                <p className="text-sm text-red-700">Errors</p>
              </div>
              <div className="p-4 bg-warning-50 rounded-lg text-center">
                <p className="text-2xl font-bold text-warning-600">{preview.duplicate_rows}</p>
                <p className="text-sm text-warning-700">Duplicates</p>
              </div>
            </div>

            {/* Errors List */}
            {preview.errors.length > 0 && (
              <div className="border border-red-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                  <h4 className="font-medium text-red-900">Issues Found</h4>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {preview.errors.slice(0, 20).map((err, idx) => (
                    <div
                      key={idx}
                      className="px-4 py-2 border-b border-red-100 last:border-0 text-sm"
                    >
                      <span className="font-medium text-red-800">Row {err.row}:</span>{' '}
                      <span className="text-red-700">{err.reason}</span>
                      {err.value && (
                        <span className="text-red-500 ml-1">
                          (value: "{err.value}")
                        </span>
                      )}
                    </div>
                  ))}
                  {preview.errors.length > 20 && (
                    <div className="px-4 py-2 text-sm text-red-600">
                      ... and {preview.errors.length - 20} more errors
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Preview Table */}
            {preview.preview_data.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-secondary-50 px-4 py-2 border-b">
                  <h4 className="font-medium text-secondary-900">Preview (first 20 rows)</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-secondary-100">
                      <tr>
                        <th className="px-3 py-2 text-left">Row</th>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Roll #</th>
                        <th className="px-3 py-2 text-left">Reg #</th>
                        <th className="px-3 py-2 text-left">Class</th>
                        <th className="px-3 py-2 text-left">Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.preview_data.map((row, idx) => (
                        <tr key={idx} className="border-b hover:bg-secondary-50">
                          <td className="px-3 py-2">{row.row_num}</td>
                          <td className="px-3 py-2">{row.full_name}</td>
                          <td className="px-3 py-2">{row.roll_number}</td>
                          <td className="px-3 py-2">{row.registration_number}</td>
                          <td className="px-3 py-2">{row.class_id}</td>
                          <td className="px-3 py-2">{row.section || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={resetImportState}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={preview.valid_rows === 0 || confirming}
              >
                {confirming && <Loader2 className="w-4 h-4 animate-spin" />}
                {!confirming && <CheckCircle2 className="w-4 h-4" />}
                Confirm Import ({preview.valid_rows} students)
              </Button>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="py-12 text-center">
            <Loader2 className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">
              Importing Students...
            </h3>
            <p className="text-secondary-500">
              This may take a few moments. Please don't close this page.
            </p>
          </div>
        )}

        {step === 'result' && result && (
          <div className="py-8 text-center">
            {result.status === 'completed' || result.status === 'completed_with_errors' ? (
              <>
                <CheckCircle2 className="w-16 h-16 text-success-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-secondary-900 mb-2">
                  Import Complete!
                </h3>
                <div className="flex justify-center gap-8 mb-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-success-600">{result.successful_rows}</p>
                    <p className="text-sm text-secondary-500">Imported</p>
                  </div>
                  {result.failed_rows > 0 && (
                    <div className="text-center">
                      <p className="text-3xl font-bold text-red-600">{result.failed_rows}</p>
                      <p className="text-sm text-secondary-500">Skipped</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-secondary-900 mb-2">
                  Import Failed
                </h3>
                <p className="text-secondary-500 mb-4">
                  Something went wrong during the import process.
                </p>
              </>
            )}
            <Button variant="primary" onClick={resetImportState}>
              Start New Import
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // Render Incomplete Data Tab Content
  const renderIncompleteTab = () => (
    <div className="space-y-4">
      {incompleteLoading ? (
        <div className="py-12 text-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
          <p className="text-secondary-500">Loading incomplete students...</p>
        </div>
      ) : incompleteData?.total_incomplete_students === 0 ? (
        <div className="bg-success-50 rounded-xl p-8 text-center border border-success-200">
          <CheckCircle2 className="w-16 h-16 text-success-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-secondary-900 mb-2">
            All Students Complete!
          </h3>
          <p className="text-secondary-600">
            All students have their required data filled in.
          </p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-warning-50 rounded-xl p-4 border border-warning-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-warning-600" />
              <div>
                <p className="font-medium text-warning-900">
                  {incompleteData?.total_incomplete_students} students with incomplete data
                </p>
                <p className="text-sm text-warning-700">
                  Complete their information to enable full functionality
                </p>
              </div>
            </div>
          </div>

          {/* Classes with Incomplete Students */}
          <div className="space-y-3">
            {incompleteData?.classes.map((cls) => (
              <div key={cls.class_id} className="bg-white rounded-xl shadow-soft border border-secondary-200 overflow-hidden">
                {/* Class Header */}
                <div
                  className="px-4 py-3 bg-secondary-50 border-b border-secondary-200 cursor-pointer flex items-center justify-between hover:bg-secondary-100 transition-colors"
                  onClick={() => toggleClassExpand(cls.class_id)}
                >
                  <div className="flex items-center gap-3">
                    {expandedClasses.has(cls.class_id) ? (
                      <ChevronDown className="w-5 h-5 text-secondary-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-secondary-500" />
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary-600" />
                      <span className="font-semibold text-secondary-900">{cls.class_name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-secondary-500">
                      {cls.students.length} students
                    </span>
                    <span className="px-2 py-1 bg-warning-100 text-warning-700 text-xs rounded-full">
                      {cls.total_missing_fields} missing fields
                    </span>
                  </div>
                </div>

                {/* Students List */}
                <AnimatePresence>
                  {expandedClasses.has(cls.class_id) && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-secondary-100">
                        {cls.students.map((student) => (
                          <div key={student.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-medium text-secondary-900">{student.full_name}</p>
                                <p className="text-sm text-secondary-500">
                                  Roll: {student.roll_number} | Reg: {student.registration_number}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {student.missing_fields.map((field) => (
                                    <span
                                      key={field}
                                      className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded"
                                    >
                                      {MISSING_FIELD_LABELS[field] || field}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {editingStudent === student.id ? (
                                <div className="flex gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={cancelEditing}
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => saveStudentData(student.id)}
                                    disabled={savingStudent === student.id}
                                  >
                                    {savingStudent === student.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                    Save
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => startEditing(student)}
                                >
                                  <Edit2 className="w-4 h-4" />
                                  Edit
                                </Button>
                              )}
                            </div>

                            {/* Inline Edit Form */}
                            {editingStudent === student.id && (
                              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-secondary-50 rounded-lg">
                                {student.missing_fields.includes('section') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Section</label>
                                    <input
                                      type="text"
                                      value={editValues.section || ''}
                                      onChange={(e) => setEditValues({ ...editValues, section: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="A, B, etc."
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('gender') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Gender</label>
                                    <select
                                      value={editValues.gender || ''}
                                      onChange={(e) => setEditValues({ ...editValues, gender: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                    >
                                      <option value="">Select...</option>
                                      <option value="Male">Male</option>
                                      <option value="Female">Female</option>
                                      <option value="Other">Other</option>
                                    </select>
                                  </div>
                                )}
                                {student.missing_fields.includes('date_of_birth') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Date of Birth</label>
                                    <input
                                      type="date"
                                      value={editValues.date_of_birth || ''}
                                      onChange={(e) => setEditValues({ ...editValues, date_of_birth: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('father_name') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Father Name</label>
                                    <input
                                      type="text"
                                      value={editValues.father_name || ''}
                                      onChange={(e) => setEditValues({ ...editValues, father_name: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('father_cnic') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Father CNIC</label>
                                    <input
                                      type="text"
                                      value={editValues.father_cnic || ''}
                                      onChange={(e) => setEditValues({ ...editValues, father_cnic: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="XXXXX-XXXXXXX-X"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('parent_contact') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Phone Number</label>
                                    <input
                                      type="text"
                                      value={editValues.parent_contact || ''}
                                      onChange={(e) => setEditValues({ ...editValues, parent_contact: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="03XX-XXXXXXX"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('address') && (
                                  <div className="col-span-2">
                                    <label className="text-sm font-medium text-secondary-700">Address</label>
                                    <input
                                      type="text"
                                      value={editValues.address || ''}
                                      onChange={(e) => setEditValues({ ...editValues, address: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <a
              href="#/students"
              className="text-secondary-500 hover:text-secondary-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <h1 className="text-2xl font-bold text-secondary-900">
              Student Data Management
            </h1>
          </div>
          <p className="text-secondary-600 ml-8">
            Import, export, and manage student data
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-secondary-200">
          <div className="flex gap-4">
            <button
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'import-export'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700'
              }`}
              onClick={() => setActiveTab('import-export')}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Import / Export
              </div>
            </button>
            <button
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'incomplete'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-secondary-500 hover:text-secondary-700'
              }`}
              onClick={() => setActiveTab('incomplete')}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Incomplete Data
                {incompleteData && incompleteData.total_incomplete_students > 0 && (
                  <span className="px-2 py-0.5 bg-warning-100 text-warning-700 text-xs rounded-full">
                    {incompleteData.total_incomplete_students}
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'import-export' ? renderImportExportTab() : renderIncompleteTab()}

        {/* History Modal */}
        <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Import History">
          {historyLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="w-8 h-8 text-primary-600 animate-spin mx-auto mb-4" />
              <p className="text-secondary-500">Loading history...</p>
            </div>
          ) : historyData.length === 0 ? (
            <div className="py-8 text-center">
              <History className="w-12 h-12 text-secondary-300 mx-auto mb-4" />
              <p className="text-secondary-500">No import history found</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {historyData.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border-b border-secondary-100 last:border-0 hover:bg-secondary-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-secondary-900">{log.file_name}</p>
                      <p className="text-sm text-secondary-500">
                        {new Date(log.timestamp).toLocaleString()} by {log.imported_by_name || log.imported_by}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        log.status === 'completed'
                          ? 'bg-success-100 text-success-700'
                          : log.status === 'completed_with_errors'
                          ? 'bg-warning-100 text-warning-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {log.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-sm">
                    <span className="text-success-600">{log.successful_rows} imported</span>
                    {log.failed_rows > 0 && (
                      <span className="text-red-600">{log.failed_rows} failed</span>
                    )}
                    {log.duplicate_count > 0 && (
                      <span className="text-warning-600">{log.duplicate_count} duplicates</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default StudentImportExportPage;

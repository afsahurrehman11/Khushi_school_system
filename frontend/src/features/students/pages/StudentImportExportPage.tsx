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
  Printer,
} from 'lucide-react';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import logger from '../../../utils/logger';
import ExportModal from '../components/ExportModal';
import { classesService } from '../../../services/classes';
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
  printStudentForms,
} from '../services/importExportApi';
import { entitySync } from '../../../utils/entitySync';

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

  // Export modal
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportClasses, setExportClasses] = useState<any[] | null>(null);
  const openExportModal = async () => {
    // Fetch classes first — do not show modal until classes/sections loaded
    try {
      logger.info('EXPORT', 'Fetching classes before opening export modal');
      setExportLoading(true);
      const res = await classesService.getClasses(1, 1000);
      const items = res.items || [];
      setExportClasses(items);
      logger.info('EXPORT', `Loaded ${items.length} classes`);
      setExportOpen(true);
    } catch (err: any) {
      logger.error('EXPORT', `Failed to load classes: ${String(err)}`);
      // Show a simple alert for now — caller can retry
      // You could replace with a nicer UI toast/modal if desired
      alert('Failed to load classes. Please retry or check console for details.');
    } finally {
      setExportLoading(false);
    }
  };

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
  const [printingSection, setPrintingSection] = useState<string | null>(null);

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
      logger.info('INCOMPLETE', 'Loading incomplete students data...');
      const data = await getIncompleteStudents();
      setIncompleteData(data);
      logger.info('INCOMPLETE', `Loaded ${data.total_incomplete_students} incomplete students in ${data.classes.length} classes/sections`);
      
      // Expand first class/section by default
      if (data.classes.length > 0) {
        const firstClass = data.classes[0];
        const sectionKey = firstClass.section ? `${firstClass.class_id}_${firstClass.section}` : firstClass.class_id;
        setExpandedClasses(new Set([sectionKey]));
      }
    } catch (err: any) {
      logger.error('INCOMPLETE', `Failed to load incomplete students: ${err.message}`);
      setError(err.message ||'Failed to load incomplete students');
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
      
      // If backend returns validating status, poll until validation is complete
      if ((res as any).status === 'validating') {
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes max (60 * 2 seconds)
        
        while (attempts < maxAttempts) {
          attempts++;
          await new Promise((r) => setTimeout(r, 2000));
          
          const statusRes = await getImportStatus((res as any).import_id);
          
          if ((statusRes as any).status === 'pending') {
            // Validation complete - use the data from status response
            const s: any = statusRes;
            const r: any = res;
            setPreview({
              import_id: s.import_id,
              file_name: s.file_name || r.file_name,
              zip_file_name: s.zip_file_name || r.zip_file_name,
              total_rows: s.total_rows || 0,
              valid_rows: s.valid_rows || 0,
              error_rows: s.error_rows || s.failed_rows || 0,
              duplicate_rows: s.duplicate_count || 0,
              errors: s.errors || [],
              duplicate_action: s.duplicate_action || duplicateAction,
              preview_data: s.preview_data || [],
              has_images: s.has_images || false,
            });
            setStep('preview');
            return;
          } else if (statusRes.status === 'failed') {
            throw new Error('Validation failed. Please check your file and try again.');
          }
        }
        
        throw new Error('Validation timed out. Please try again.');
      } else {
        // Older flow: direct preview response
        setPreview(res);
        setStep('preview');
      }
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
          // Notify other components that students were created/updated so lists refresh
          try {
            entitySync.emitStudentCreated(preview.import_id);
          } catch (e) {
            // ignore
          }
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
      section: student.current_data.section || '',
      gender: student.current_data.gender || '',
      date_of_birth: student.current_data.date_of_birth || '',
      admission_date: student.current_data.admission_date || '',
      registration_number: student.current_data.registration_number || '',
      father_name: student.current_data.father_name || '',
      mother_name: student.current_data.mother_name || '',
      father_cnic: student.current_data.father_cnic || '',
      parent_contact: student.current_data.parent_contact || '',
      guardian_email: student.current_data.guardian_email || '',
      address: student.current_data.address || '',
      emergency_contact: student.current_data.emergency_contact || '',
    });
  };

  const cancelEditing = () => {
    setEditingStudent(null);
    setEditValues({});
  };

  const saveStudentData = async (studentId: string) => {
    setSavingStudent(studentId);
    try {
      // Validate parent contact follows new format 92XXXXXXXXXX
      const phoneRegex = /^92\d{10}$/;
      if (editValues.parent_contact && !phoneRegex.test(editValues.parent_contact)) {
        setError('Parent contact must be in format 92XXXXXXXXXX');
        setSavingStudent(null);
        return;
      }
      
      // Validate emergency contact if provided
      if (editValues.emergency_contact && !phoneRegex.test(editValues.emergency_contact)) {
        setError('Emergency contact must be in format 92XXXXXXXXXX');
        setSavingStudent(null);
        return;
      }
      
      await updateIncompleteStudent(studentId, editValues);
      await loadIncompleteStudents();
      setEditingStudent(null);
      setEditValues({});
      logger.info('INCOMPLETE', `Successfully updated student ${studentId}`);
    } catch (err: any) {
      logger.error('INCOMPLETE', `Failed to update student: ${err.message}`);
      setError(err.message || 'Failed to update student');
    } finally {
      setSavingStudent(null);
    }
  };

  const handlePrintForms = async (classId: string, section?: string) => {
    const sectionKey = section ? `${classId}_${section}` : classId;
    setPrintingSection(sectionKey);
    try {
      logger.info('PRINT', `Printing forms for class ${classId}, section ${section || 'all'}`);
      await printStudentForms(classId, section);
      logger.info('PRINT', 'PDF generated successfully');
    } catch (err: any) {
      logger.error('PRINT', `Failed to print forms: ${err.message}`);
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setPrintingSection(null);
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
          onClick={() => { if (!exportLoading) openExportModal(); }}
        >
          <div className="w-10 h-10 bg-success-100 rounded-lg flex items-center justify-center mb-3">
            <Download className="w-5 h-5 text-success-600" />
          </div>
          <h3 className="text-base font-semibold text-secondary-900 mb-1">Export Students</h3>
          <p className="text-sm text-secondary-500">Download all students as Excel file</p>
            <div className="mt-3">
            <Button variant="success" size="sm" disabled={exportLoading || exporting} onClick={(e) => { e.stopPropagation(); if (!exportLoading) openExportModal(); }}>
              <Download className="w-4 h-4" />
              {exportLoading ? 'Loading classes...' : exporting ? 'Exporting...' : 'Export'}
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
            {(preview.errors?.length || 0) > 0 && (
              <div className="border border-red-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                  <h4 className="font-medium text-red-900">Issues Found</h4>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {(preview.errors || []).slice(0, 20).map((err, idx) => (
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
                  {(preview.errors?.length || 0) > 20 && (
                    <div className="px-4 py-2 text-sm text-red-600">
                      ... and {(preview.errors?.length || 0) - 20} more errors
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Preview Table */}
            {(preview.preview_data?.length || 0) > 0 && (
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
                      {(preview.preview_data || []).map((row, idx) => (
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
          <div className="space-y-4">
            {incompleteData?.classes.map((cls) => {
              const sectionKey = cls.section ? `${cls.class_id}_${cls.section}` : cls.class_id;
              const isPrinting = printingSection === sectionKey;
              
              return (
              <div key={sectionKey} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                {/* Class Header with Print Button */}
                <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 flex items-center justify-between">
                  <div 
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => toggleClassExpand(sectionKey)}
                  >
                    {expandedClasses.has(sectionKey) ? (
                      <ChevronDown className="w-5 h-5 text-indigo-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-indigo-600" />
                    )}
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <div>
                        <span className="font-semibold text-gray-900">{cls.class_name}</span>
                        {cls.section && <span className="ml-2 text-gray-600">- Section {cls.section}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      {cls.students.length} student{cls.students.length !== 1 ? 's' : ''}
                    </span>
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                      {cls.total_missing_fields} missing
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrintForms(cls.class_id, cls.section);
                      }}
                      disabled={isPrinting}
                      className="flex items-center gap-2"
                    >
                      {isPrinting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Printer className="w-4 h-4" />
                      )}
                      {isPrinting ? 'Generating...' : 'Print Forms'}
                    </Button>
                  </div>
                </div>

                {/* Students List */}
                <AnimatePresence>
                  {expandedClasses.has(sectionKey) && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-gray-100">
                        {cls.students.map((student) => (
                          <div key={student.id} className="p-5 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-gray-900 text-lg">{student.full_name}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                  Roll: <span className="font-medium">{student.roll_number}</span> | Reg: <span className="font-medium">{student.registration_number}</span>
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                  {student.missing_fields.map((field) => (
                                    <span
                                      key={field}
                                      className="px-2.5 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-md border border-red-200"
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
                                      placeholder="92XXXXXXXXXX"
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
                                {student.missing_fields.includes('admission_date') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Admission Date</label>
                                    <input
                                      type="date"
                                      value={editValues.admission_date || ''}
                                      onChange={(e) => setEditValues({ ...editValues, admission_date: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('registration_number') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Registration Number</label>
                                    <input
                                      type="text"
                                      value={editValues.registration_number || ''}
                                      onChange={(e) => setEditValues({ ...editValues, registration_number: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="REG-YYYY-####"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('mother_name') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Mother Name</label>
                                    <input
                                      type="text"
                                      value={editValues.mother_name || ''}
                                      onChange={(e) => setEditValues({ ...editValues, mother_name: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('guardian_email') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Guardian Email</label>
                                    <input
                                      type="email"
                                      value={editValues.guardian_email || ''}
                                      onChange={(e) => setEditValues({ ...editValues, guardian_email: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="email@example.com"
                                    />
                                  </div>
                                )}
                                {student.missing_fields.includes('emergency_contact') && (
                                  <div>
                                    <label className="text-sm font-medium text-secondary-700">Emergency Contact</label>
                                    <input
                                      type="text"
                                      value={editValues.emergency_contact || ''}
                                      onChange={(e) => setEditValues({ ...editValues, emergency_contact: e.target.value })}
                                      className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                                      placeholder="92XXXXXXXXXX"
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
              );
            })}
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

        {/* Modals */}
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

        {/* Export Modal */}
        <ExportModal isOpen={exportOpen} onClose={() => { logger.info('EXPORT', 'Export modal closed'); setExportOpen(false); }} classes={exportClasses || undefined} />

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

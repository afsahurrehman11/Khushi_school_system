import React, { useState, useEffect, Suspense, lazy } from 'react';
import Button from '../../../components/Button';
import { FeeCategoryModal, FeeVoucherSettingsModal } from '../components';
import { InAppNotificationService } from '../services';
import { api } from '../../../utils/api';
import { config } from '../../../config';
import { authService } from '../../../services/auth';


interface ClassData {
  id: string;
  class_name: string;
  section?: string;
  fee_category?: {
    id: string;
    name: string;
    total_amount: number;
    components?: { component_name: string; amount: number; }[];
  };
  student_count: number;
  fee_summary: {
    paid: number;
    partial: number;
    unpaid: number;
  };
}

interface StudentData {
  id: string;
  student_id: string;
  full_name: string;
  fee_status: 'paid' | 'partial' | 'unpaid';
  fee_category: string;
  total_fee: number;
  paid_amount: number;
  remaining_amount: number;
  roll_number?: string;
  registration_id?: string;
  arrears?: number;
  scholarship_percent?: number;
  scholarship_amount?: number;
}

const FeePage: React.FC = () => {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all');
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showVoucherSettingsModal, setShowVoucherSettingsModal] = useState(false);
  const [, setSavedPaymentMethods] = useState<string[]>([]);
  const [downloadingVoucher, setDownloadingVoucher] = useState(false);
  const [downloadingClassVouchers, setDownloadingClassVouchers] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{ jobId: string, status: string, progress: number, type: string } | null>(null);
  const [classDetails, setClassDetails] = useState<Record<string, { loading: boolean; student_count?: number; fee_category?: any; fee_summary?: any }>>({});
  const [selectedFeeTab, setSelectedFeeTab] = useState<'overview' | 'history' | 'records' | 'record'>('overview');
  const [exportStatus, setExportStatus] = useState<'paid' | 'partial' | 'unpaid' | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showExportInline, setShowExportInline] = useState(false);
  const exportInlineRef = React.useRef<HTMLDivElement | null>(null);

  // Lazy-load student fee components
  const FeeOverviewTab = lazy(() => import('../../../features/students/components/FeeOverviewTab'));
  const MonthlyHistoryTab = lazy(() => import('../../../features/students/components/MonthlyHistoryTab'));
  const PaymentRecordsTab = lazy(() => import('../../../features/students/components/PaymentRecordsTab'));
  const RecordPaymentTab = lazy(() => import('../../../features/students/components/RecordPaymentTab'));

  // Cash session hook removed (not needed in this view)

  useEffect(() => {
    loadClasses();
  }, []);

  // Lazy-load per-class details (student count, fee category) when card is hovered
  const loadClassCardDetails = async (classId: string) => {
    // Only skip if we already have loaded student_count (i.e. details present)
    if (classDetails[classId]?.student_count !== undefined) return;

    setClassDetails(prev => ({ ...prev, [classId]: { loading: true } }));

    try {
      const [feeDataResp, studentsResp] = await Promise.allSettled([
        api.get(`/class-fee-assignments/classes/${classId}/active`).catch(() => null),
        api.get(`/students?class_id=${classId}`).catch(() => []),
      ]);

      let student_count = 0;
      let studentsList: any[] = [];
      if (studentsResp.status === 'fulfilled') {
        studentsList = Array.isArray(studentsResp.value) ? studentsResp.value : [];
        student_count = studentsList.length;
      }

      let fee_category = null;
      if (feeDataResp.status === 'fulfilled' && feeDataResp.value?.category_id) {
        try {
          const cat = await api.get(`/fee-categories/${feeDataResp.value.category_id}`);
          fee_category = cat || null;
        } catch (e) {
          fee_category = null;
        }
      }

      // Fetch per-student payment summary in bulk to avoid N+1 HTTP calls.
      let fee_summary = null;
      try {
        if (studentsList.length > 0) {
          const ids = studentsList.map(s => s.id);
          // Backend endpoint returns a mapping student_id -> summary
          const res = await api.post(`/fee-payments/students/summary`, { student_ids: ids });
          let paid = 0, partial = 0, unpaid = 0;
          for (const sid of ids) {
            const s = res[sid] || { status: 'unpaid' };
            if (s.status === 'paid') paid++;
            else if (s.status === 'partial') partial++;
            else unpaid++;
          }
          fee_summary = { paid, partial, unpaid };
        } else {
          fee_summary = { paid: 0, partial: 0, unpaid: 0 };
        }
      } catch (e) {
        fee_summary = null;
      }

      setClassDetails(prev => ({ ...prev, [classId]: { loading: false, student_count, fee_category, fee_summary } }));
    } catch (e) {
      setClassDetails(prev => ({ ...prev, [classId]: { loading: false } }));
    }
  };

  // Poll job status
  const pollJobStatus = async (jobId: string, jobType: string) => {
    const maxAttempts = 120; // 2 minutes max (120 * 1 second)
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/jobs/${jobId}/status`, {
          headers: authService.getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error('Failed to check job status');
        }

        const status = await response.json();
        console.log(`[FEE_VOUCHER] Job ${jobId} status:`, status);

        setJobProgress({
          jobId,
          status: status.status,
          progress: status.progress || 0,
          type: jobType
        });

        if (status.status === 'completed') {
          // Download the result
          await downloadJobResult(jobId, jobType);
          setJobProgress(null);
          return true;
        }

        if (status.status === 'failed') {
          throw new Error(status.error || 'Job failed');
        }

        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (error: any) {
        console.error('[FEE_VOUCHER] Error polling job:', error);
        setJobProgress(null);
        throw error;
      }
    }

    setJobProgress(null);
    throw new Error('Job timeout - please try again');
  };

  // Download completed job result
  const downloadJobResult = async (jobId: string, jobType: string) => {
    const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/jobs/${jobId}/download`, {
      headers: authService.getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to download' }));
      throw new Error(error.detail || 'Failed to download');
    }

    const blob = await response.blob();

    if (jobType === 'zip') {
      // Download ZIP file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee_vouchers_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      InAppNotificationService.success('Fee vouchers downloaded successfully');
    } else {
      // Open PDF for printing
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');

      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      } else {
        InAppNotificationService.error('Please allow popups to print vouchers');
      }
    }
  };

  const handleDownloadClassVouchersZip = async (classData: ClassData, e: React.MouseEvent) => {
    e.stopPropagation();

    setDownloadingClassVouchers(classData.id);
    try {
      console.log('[FEE_VOUCHER] Starting background job for class ZIP:', classData.id);

      // Check if class has many students (use background job for >10 students)
      const studentCount = (classData as any).student_count || 0;
      const useBackgroundJob = studentCount > 10;

      if (useBackgroundJob) {
        // Use background job for large classes
        InAppNotificationService.info('Generating vouchers... This may take a moment.');

        const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/class/${classData.id}/download-all/background`, {
          method: 'POST',
          headers: {
            ...authService.getAuthHeaders(),
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to start generation' }));
          throw new Error(error.detail || 'Failed to start generation');
        }

        const result = await response.json();
        console.log('[FEE_VOUCHER] Background job started:', result.job_id);

        // Poll for completion
        await pollJobStatus(result.job_id, 'zip');
      } else {
        // Direct download for small classes
        const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/class/${classData.id}/download-all`, {
          method: 'GET',
          headers: authService.getAuthHeaders(),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to download vouchers' }));
          throw new Error(error.detail || 'Failed to download vouchers');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fee_vouchers_${classData.class_name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log('[FEE_VOUCHER] ✅ Class vouchers ZIP downloaded successfully');
        InAppNotificationService.success('Fee vouchers downloaded successfully');
      }
    } catch (error: any) {
      console.error('[FEE_VOUCHER] ❌ Error downloading class vouchers:', error);
      InAppNotificationService.error(error.message || 'Failed to download fee vouchers');
    } finally {
      setDownloadingClassVouchers(null);
    }
  };

  const handlePrintClassVouchers = async (classData: ClassData, e: React.MouseEvent) => {
    e.stopPropagation();

    setDownloadingClassVouchers(classData.id);
    try {
      console.log('[FEE_VOUCHER] Starting background job for class print:', classData.id);

      // Check if class has many students (use background job for >10 students)
      const studentCount = (classData as any).student_count || 0;
      const useBackgroundJob = studentCount > 10;

      if (useBackgroundJob) {
        // Use background job for large classes
        InAppNotificationService.info('Generating vouchers... This may take a moment.');

        const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/class/${classData.id}/print-all/background`, {
          method: 'POST',
          headers: {
            ...authService.getAuthHeaders(),
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to start generation' }));
          throw new Error(error.detail || 'Failed to start generation');
        }

        const result = await response.json();
        console.log('[FEE_VOUCHER] Background job started:', result.job_id);

        // Poll for completion
        await pollJobStatus(result.job_id, 'pdf');
      } else {
        // Direct print for small classes
        const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/class/${classData.id}/print-all`, {
          method: 'GET',
          headers: authService.getAuthHeaders(),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Failed to load vouchers' }));
          throw new Error(error.detail || 'Failed to load vouchers');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');

        if (printWindow) {
          printWindow.addEventListener('load', () => {
            printWindow.print();
          });
        } else {
          InAppNotificationService.error('Please allow popups to print vouchers');
        }

        console.log('[FEE_VOUCHER] ✅ Class print preview opened successfully');
      }
    } catch (error: any) {
      console.error('[FEE_VOUCHER] ❌ Error opening class print preview:', error);
      InAppNotificationService.error(error.message || 'Failed to open print preview');
    } finally {
      setDownloadingClassVouchers(null);
    }
  };

  const handleDownloadVoucher = async () => {
    if (!selectedStudent) return;

    setDownloadingVoucher(true);
    try {
      console.log('[FEE_VOUCHER] Downloading voucher for student:', selectedStudent.id);

      const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/student/${selectedStudent.id}/download`, {
        method: 'GET',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to download voucher' }));
        throw new Error(error.detail || 'Failed to download voucher');
      }

      // Get the blob from response
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee_voucher_${selectedStudent.full_name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      console.log('[FEE_VOUCHER] ✅ Voucher downloaded successfully');
      InAppNotificationService.success('Fee voucher downloaded successfully');
    } catch (error: any) {
      console.error('[FEE_VOUCHER] ❌ Error downloading voucher:', error);
      InAppNotificationService.error(error.message || 'Failed to download fee voucher');
    } finally {
      setDownloadingVoucher(false);
    }
  };

  const handlePrintVoucher = async () => {
    if (!selectedStudent) return;

    setDownloadingVoucher(true);
    try {
      console.log('[FEE_VOUCHER] Opening print preview for student:', selectedStudent.id);

      const response = await fetch(`${config.API_BASE_URL}/fees/vouchers/student/${selectedStudent.id}/print`, {
        method: 'GET',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to load voucher' }));
        throw new Error(error.detail || 'Failed to load voucher');
      }

      // Get the blob from response
      const blob = await response.blob();

      // Open in new window for printing
      const url = window.URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');

      if (printWindow) {
        printWindow.addEventListener('load', () => {
          printWindow.print();
        });
      } else {
        InAppNotificationService.error('Please allow popups to print vouchers');
      }

      console.log('[FEE_VOUCHER] ✅ Print preview opened successfully');
    } catch (error: any) {
      console.error('[FEE_VOUCHER] ❌ Error opening print preview:', error);
      InAppNotificationService.error(error.message || 'Failed to open print preview');
    } finally {
      setDownloadingVoucher(false);
    }
  };

  const loadClasses = async () => {
    setLoading(true);
    try {
      // Fetch basic classes list quickly. Detailed info is loaded lazily per-card.
      const classesData = await api.get('/classes');
      const minimal = classesData.map((cls: any) => ({
        id: cls.id,
        class_name: cls.class_name,
        section: cls.section,
        fee_category: null,
        student_count: null,
        fee_summary: null,
      }));
      setClasses(minimal);
      // Initialize inline loaders for each card and start background fetches (staggered)
      const initialDetails: Record<string, any> = {};
      minimal.forEach((c: any) => { initialDetails[c.id] = { loading: true }; });
      setClassDetails(initialDetails);

      minimal.forEach((c: any, idx: number) => {
        // stagger requests to avoid bursting the backend
        setTimeout(() => {
          // fire-and-forget; loadClassCardDetails will update classDetails when done
          loadClassCardDetails(c.id).catch(() => { });
        }, idx * 150);
      });
    } catch (error) {
      InAppNotificationService.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const loadStudentsForClass = async (classData: ClassData) => {
    setLoading(true);
    try {
      const studentsData = await api.get(`/students?class_id=${classData.id}`);

      // Bulk fetch fee summaries for students to avoid N+1 API calls
      let summaries: Record<string, any> = {};
      try {
        const ids = studentsData.map((s: any) => s.id);
        if (ids.length > 0) {
          summaries = await api.post(`/fee-payments/students/summary`, { student_ids: ids });
        }
      } catch (e) {
        summaries = {};
      }

      const enrichedStudents = (studentsData || []).map((student: any) => {
        const ssummary = summaries[student.id] || {};
        const total_fee = ssummary.total_fee ?? classData.fee_category?.total_amount ?? 0;
        const paid_amount = ssummary.paid_amount ?? 0;
        // scholarship percent may be on student document
        const scholarship_percent = student.scholarship_percent ?? student.scholarship ?? 0;
        const scholarship_amount = Math.round((total_fee * (scholarship_percent || 0)) / 100);
        const arrears = ssummary.arrears ?? student.arrears_balance ?? student.arrears ?? 0;
        const remaining_amount = (total_fee - (paid_amount || 0) + (arrears || 0) - (scholarship_amount || 0));

        const status = (ssummary.status as 'paid' | 'partial' | 'unpaid') || ((remaining_amount <= 0) ? 'paid' : (paid_amount > 0 ? 'partial' : 'unpaid'));

        return {
          id: student.id,
          student_id: student.student_id,
          full_name: student.full_name,
          roll_number: student.roll_number || student.roll_no || '',
          registration_id: student.registration_number || student.student_id || '',
          fee_status: status,
          fee_category: classData.fee_category?.name || 'No Category',
          total_fee: total_fee,
          paid_amount: paid_amount,
          remaining_amount: remaining_amount,
          arrears: arrears,
          scholarship_percent: scholarship_percent,
          scholarship_amount: scholarship_amount,
        } as StudentData & any;
      });

      setStudents(enrichedStudents);
      setSelectedClass(classData);
      // Load saved payment method names for later use
      try {
        const methods = await api.get('/payment-methods');
        setSavedPaymentMethods(methods.map((m: any) => m.name));
      } catch (err) {
        // non-critical
      }
    } catch (error) {
      InAppNotificationService.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleExportByStatus = async (statusParam?: 'paid' | 'partial' | 'unpaid') => {
    const statusToUse = statusParam ?? exportStatus;

    if (exporting) {
      console.log('[EXPORT] 🔄 Export already in progress');
      InAppNotificationService.info('Export already in progress');
      return;
    }

    if (!statusToUse || !selectedClass) {
      console.warn('[EXPORT] ❌ Missing status or class', { statusToUse, selectedClass: selectedClass ? { id: selectedClass.id, name: selectedClass.class_name, section: selectedClass.section } : null });
      return;
    }

    setExporting(true);
    console.log(`[EXPORT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[EXPORT] Starting export | Class: ${selectedClass.class_name} (${selectedClass.id})`);
    console.log(`[EXPORT] Section: ${selectedClass.section || 'All Sections'}`);
    console.log(`[EXPORT] Status filter: ${statusToUse.toUpperCase()}`);
    console.log(`[EXPORT] Time: ${new Date().toISOString()}`);
    InAppNotificationService.info(`Exporting ${statusToUse} students from ${selectedClass.section || 'all sections'}...`);
    
    try {
      const sectionParam = selectedClass.section ? `&section=${encodeURIComponent(selectedClass.section)}` : '';
      const url = `${config.API_BASE_URL}/fees/export?class_id=${selectedClass.id}&status=${statusToUse}${sectionParam}`;
      console.log(`[EXPORT] API Request: ${url}`);
      console.log(`[EXPORT] Headers: Authorization present`);
      
      const startTime = performance.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: authService.getAuthHeaders(),
      });
      const fetchTime = (performance.now() - startTime).toFixed(2);

      console.log(`[EXPORT] Response status: ${response.status} | Time: ${fetchTime}ms`);
      console.log(`[EXPORT] Content-Type: ${response.headers.get('content-type')}`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to export' }));
        console.error('[EXPORT] ❌ HTTP Error:', { status: response.status, error });
        throw new Error(error.detail || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      console.log(`[EXPORT] ✅ Received blob: ${blob.size} bytes | type: ${blob.type}`);
      
      // Show details about blob content (first 500 bytes as text if XML/JSON)
      if (blob.type.includes('spreadsheet') || blob.type.includes('xml')) {
        try {
          const text = await blob.slice(0, 500).text();
          console.log(`[EXPORT] Blob preview (first 500 chars): ${text.substring(0, 200)}`);
        } catch (e) {
          console.log('[EXPORT] (binary blob, skipped preview)');
        }
      }

      // Trigger download
      const url_obj = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url_obj;
      const date = new Date().toISOString().split('T')[0];
      const sectionSuffix = selectedClass.section ? `_${selectedClass.section.replace(/ /g, '_')}` : '';
      a.download = `fee_report_${selectedClass.class_name.replace(/ /g, '_')}${sectionSuffix}_${statusToUse}_${date}.xlsx`;
      
      console.log(`[EXPORT] Creating download link: ${a.download}`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url_obj);

      console.log(`[EXPORT] ✅ Download initiated: ${a.download}`);
      console.log(`[EXPORT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      InAppNotificationService.success(`${statusToUse} students exported successfully`);
      setExportStatus(null);
    } catch (error: any) {
      console.error('[EXPORT] ❌ Exception caught:', error);
      console.error('[EXPORT] ❌ Stack:', error.stack);
      console.log(`[EXPORT] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      InAppNotificationService.error(error.message || 'Failed to export fee report');
    } finally {
      setExporting(false);
    }
  };

  const handleOpenExportModal = () => {
    if (!selectedClass) return;
    setShowExportInline((s) => !s);
  };

  // Close inline dropdown on outside click
  React.useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!showExportInline) return;
      const el = exportInlineRef.current;
      if (!el) return;
      if (!(e.target instanceof Node)) return;
      if (!el.contains(e.target)) setShowExportInline(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showExportInline]);

  // Export modal replaced with native prompt; no debug overlays here.

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 border-green-300';
      case 'partial': return 'bg-yellow-100 border-yellow-300';
      case 'unpaid': return 'bg-red-100 border-red-300';
      default: return 'bg-gray-100 border-gray-300';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid': return 'Paid';
      case 'partial': return 'Partial';
      case 'unpaid': return 'Unpaid';
      default: return 'Unknown';
    }
  };

  

  if (selectedStudent) {
    return (
      <div className="min-h-screen p-8 bg-secondary-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-primary-900">Fee Management - {selectedStudent.full_name}</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadVoucher}
                disabled={downloadingVoucher}
                className="p-2 rounded-full text-white bg-primary-600 hover:bg-primary-700"
                title={downloadingVoucher ? 'Downloading...' : 'Download Voucher'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrintVoucher}
                disabled={downloadingVoucher}
                className="p-2 rounded-full bg-white border border-primary-300 text-primary-700 hover:bg-primary-50"
                title={downloadingVoucher ? 'Loading...' : 'Print Voucher'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </Button>
              <button onClick={() => setSelectedStudent(null)} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors">Back to Students</button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex border-b border-secondary-200 -mt-2 mb-4">
              <button onClick={() => setSelectedFeeTab('overview')} className={`px-4 py-3 text-sm font-medium ${selectedFeeTab === 'overview' ? 'border-b-2 border-primary-500 text-primary-600' : 'text-secondary-500 hover:text-secondary-700'}`}>Overview</button>
              <button onClick={() => setSelectedFeeTab('record')} className={`px-4 py-3 text-sm font-medium ${selectedFeeTab === 'record' ? 'border-b-2 border-primary-500 text-primary-600' : 'text-secondary-500 hover:text-secondary-700'}`}>Record Payment</button>
              
              <button onClick={() => setSelectedFeeTab('history')} className={`px-4 py-3 text-sm font-medium ${selectedFeeTab === 'history' ? 'border-b-2 border-primary-500 text-primary-600' : 'text-secondary-500 hover:text-secondary-700'}`}>Monthly History</button>
              <button onClick={() => setSelectedFeeTab('records')} className={`px-4 py-3 text-sm font-medium ${selectedFeeTab === 'records' ? 'border-b-2 border-primary-500 text-primary-600' : 'text-secondary-500 hover:text-secondary-700'}`}>Payment Records</button>
            </div>

            <div>
              <Suspense fallback={<div className="py-8 text-center text-gray-600">Loading...</div>}>
                {selectedFeeTab === 'overview' && (
                  <FeeOverviewTab studentId={String(selectedStudent.id)} studentName={selectedStudent.full_name} studentCode={selectedStudent.student_id} className={selectedClass?.class_name} classId={selectedClass?.id} onPrintVoucher={handlePrintVoucher} onRefresh={async () => { if (selectedClass) await loadStudentsForClass(selectedClass); }} />
                )}

                {selectedFeeTab === 'record' && (
                  <RecordPaymentTab studentId={String(selectedStudent.id)} onRecorded={async () => { if (selectedClass) await loadStudentsForClass(selectedClass); }} />
                )}

                {selectedFeeTab === 'history' && <MonthlyHistoryTab studentId={String(selectedStudent.id)} />}

                {selectedFeeTab === 'records' && <PaymentRecordsTab studentId={String(selectedStudent.id)} />}
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedClass) {
    return (
      <div className="min-h-screen p-8 bg-secondary-50">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-primary-900">
              Students - {selectedClass.class_name} {selectedClass.section || ''}
            </h1>
            <Button variant="ghost" onClick={() => { setSelectedClass(null); setStudents([]); }}>
              Back to Classes
            </Button>
          </div>

          {/* Horizontal navbar with filter and export */}
          <div className="bg-white rounded-lg shadow-sm border border-secondary-200 px-4 py-3 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-secondary-700">Filter:</label>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-3 py-2 border border-secondary-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                <option value="all">All</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
              <span className="text-sm text-secondary-500 ml-2">
                ({students.filter(s => filterStatus === 'all' ? true : s.fee_status === filterStatus).length} students)
              </span>
            </div>
            
            <div className="relative">
              <button
                onClick={() => handleOpenExportModal()}
                disabled={exporting}
                className={`flex items-center gap-2 px-4 py-2 ${exporting ? 'bg-success-300 cursor-not-allowed' : 'bg-success-600 hover:bg-success-700'} text-white rounded-lg text-sm font-medium transition-colors shadow-sm`}
                title="Export Students by Fee Status"
              >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export Excel
              </button>

              {showExportInline && (
                <div ref={exportInlineRef} className="absolute right-0 mt-2 w-44 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setShowExportInline(false); handleExportByStatus('paid'); }}>Paid</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setShowExportInline(false); handleExportByStatus('partial'); }}>Partial</button>
                  <button className="w-full text-left px-3 py-2 hover:bg-gray-100" onClick={() => { setShowExportInline(false); handleExportByStatus('unpaid'); }}>Unpaid</button>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading students...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {students.filter(s => filterStatus === 'all' ? true : s.fee_status === filterStatus).map((student) => (
                    <div
                      key={student.id}
                      className={`rounded-lg shadow-md p-4 border-l-4 cursor-pointer hover:shadow-lg transition-shadow ${getStatusColor(student.fee_status)}`}
                      onClick={() => setSelectedStudent(student)}
                    >
                      <h3 className="font-semibold text-lg mb-1 truncate">{student.full_name}</h3>
                      <div className="text-sm text-gray-600 mb-2">
                        <div>Roll: {student.roll_number || '—'}</div>
                        <div>Reg: {student.registration_id || '—'}</div>
                      </div>

                      <div className="flex items-center justify-between text-sm mb-2">
                        <div className="text-gray-700">Arrears</div>
                        <div className="font-medium text-gray-900">{new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(student.arrears || 0)}</div>
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <div className="text-gray-700">Remaining</div>
                        <div className="font-medium text-gray-900">{new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(student.remaining_amount || 0)}</div>
                      </div>

                      <div className="mt-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${student.fee_status === 'paid' ? 'bg-green-200 text-green-800' : student.fee_status === 'partial' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {getStatusText(student.fee_status)}
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-secondary-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-primary-900">Fees Management</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Manage Fee Categories
            </button>
            <button
              onClick={() => setShowVoucherSettingsModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Manage Fee Voucher
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading classes...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow relative"
              >
                {/* Action buttons */}
                <div className="absolute top-3 right-3 flex gap-2">
                  <button
                    onClick={(e) => handleDownloadClassVouchersZip(cls, e)}
                    disabled={downloadingClassVouchers === cls.id}
                    className="p-2 hover:bg-blue-50 rounded-full transition-colors group relative"
                    title="Download all vouchers as ZIP"
                  >
                    {downloadingClassVouchers === cls.id ? (
                      <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={(e) => handlePrintClassVouchers(cls, e)}
                    disabled={downloadingClassVouchers === cls.id}
                    className="p-2 hover:bg-green-50 rounded-full transition-colors group relative"
                    title="Print all vouchers"
                  >
                    {downloadingClassVouchers === cls.id ? (
                      <svg className="animate-spin h-5 w-5 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Clickable area for viewing students */}
                <div
                  className="cursor-pointer"
                  onMouseEnter={() => loadClassCardDetails(cls.id)}
                  onClick={() => loadStudentsForClass(cls)}
                >
                  <h3 className="text-xl font-semibold mb-2 pr-16">{cls.class_name} {cls.section || ''}</h3>
                  <p className="text-gray-600 mb-2">
                    Fee Category: {classDetails[cls.id]?.loading ? (
                      <span className="inline-flex items-center gap-1">
                        <svg className="animate-spin inline-block h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      </span>
                    ) : (classDetails[cls.id]?.fee_category?.name || cls.fee_category?.name || 'Not Assigned')}
                  </p>
                  <p className="text-gray-600 mb-4">Students: {classDetails[cls.id]?.loading ? (
                    <svg className="animate-spin inline-block h-3 w-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : (classDetails[cls.id]?.student_count ?? '—')}</p>

                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Paid:</span>
                      <span className="text-green-600">{classDetails[cls.id]?.loading ? (
                        <svg className="animate-spin inline-block h-3 w-3 text-green-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      ) : (classDetails[cls.id]?.fee_summary?.paid ?? cls.fee_summary?.paid ?? '—')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Partial:</span>
                      <span className="text-yellow-600">{classDetails[cls.id]?.loading ? (
                        <svg className="animate-spin inline-block h-3 w-3 text-yellow-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      ) : (classDetails[cls.id]?.fee_summary?.partial ?? cls.fee_summary?.partial ?? '—')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Unpaid:</span>
                      <span className="text-red-600">{classDetails[cls.id]?.loading ? (
                        <svg className="animate-spin inline-block h-3 w-3 text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      ) : (classDetails[cls.id]?.fee_summary?.unpaid ?? cls.fee_summary?.unpaid ?? '—')}</span>
                    </div>
                  </div>
                  
                </div>
              </div>
            ))}
          </div>
        )}

        <FeeCategoryModal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} />
        <FeeVoucherSettingsModal isOpen={showVoucherSettingsModal} onClose={() => setShowVoucherSettingsModal(false)} />
        {/* Export now uses native prompt flow (no modal) */}

        {/* Progress Modal for Background Jobs */}
        {jobProgress && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
              <div className="text-center">
                <h3 className="text-xl font-semibold mb-4 text-primary-900">
                  Generating Fee Vouchers
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  {jobProgress.status === 'pending' && 'Starting generation...'}
                  {jobProgress.status === 'processing' && 'Processing vouchers...'}
                  {jobProgress.status === 'completed' && 'Downloading...'}
                </p>

                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                  <div
                    className="bg-primary-600 h-3 rounded-full transition-all duration-300 ease-in-out"
                    style={{ width: `${jobProgress.progress}%` }}
                  ></div>
                </div>

                <p className="text-sm font-medium text-gray-700">
                  {jobProgress.progress}%
                </p>

                {/* Spinner */}
                <div className="mt-6 flex justify-center">
                  <svg className="animate-spin h-10 w-10 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>

                <p className="text-xs text-gray-500 mt-4">
                  This may take a minute for large classes...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeePage;

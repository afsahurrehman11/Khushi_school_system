import React, { useState, useEffect } from 'react';
import Button from '../../../components/Button';
import FeeCategoryModal from '../components/FeeCategoryModal';
import FeeVoucherSettingsModal from '../components/FeeVoucherSettingsModal';
import { InAppNotificationService } from '../services';
import { api } from '../../../utils/api';
import { config } from '../../../config';
import { authService } from '../../../services/auth';
import { useCashSession } from '../hooks/useCashSession';

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
}

const FeePage: React.FC = () => {
  const [classes, setClasses] = useState<ClassData[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassData | null>(null);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showVoucherSettingsModal, setShowVoucherSettingsModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<string[]>([]);
  const [transactionRef, setTransactionRef] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [downloadingVoucher, setDownloadingVoucher] = useState(false);
  const [downloadingClassVouchers, setDownloadingClassVouchers] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<{ jobId: string, status: string, progress: number, type: string } | null>(null);
  const [classDetails, setClassDetails] = useState<Record<string, { loading: boolean; student_count?: number; fee_category?: any; fee_summary?: any }>>({});

  // Cash session for validating payments are only recorded with active session
  const { session: cashSession } = useCashSession();
  const isSessionActive = cashSession?.status === 'active';

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

      // Fetch per-student payment summary to compute paid/partial/unpaid counts.
      let fee_summary = null;
      try {
        if (studentsList.length > 0) {
          // Limit concurrency by batching
          const BATCH = 50;
          const chunks: any[][] = [];
          for (let i = 0; i < studentsList.length; i += BATCH) chunks.push(studentsList.slice(i, i + BATCH));

          let paid = 0, partial = 0, unpaid = 0;
          for (const chunk of chunks) {
            const promises = chunk.map((s: any) => api.get(`/fee-payments/student/${s.id}/summary`).catch(() => ({ status: 'unpaid' })));
            const results = await Promise.allSettled(promises);
            for (const r of results) {
              if (r.status === 'fulfilled') {
                const s = r.value;
                if (s?.status === 'paid') paid++;
                else if (s?.status === 'partial') partial++;
                else unpaid++;
              } else {
                unpaid++;
              }
            }
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
      const studentsData = await api.get(`/api/students?class_id=${classData.id}`);

      // Enrich with fee status
      const enrichedStudents = await Promise.all(
        studentsData.map(async (student: any) => {
          // Get fee summary for student
          let summary = {
            total_fee: classData.fee_category?.total_amount || 0,
            paid_amount: 0,
            remaining_amount: classData.fee_category?.total_amount || 0,
            status: 'unpaid' as const,
          };
          try {
            summary = await api.get(`/fee-payments/student/${student.id}/summary`);
          } catch (e) {
            // Keep default
          }

          return {
            id: student.id,
            student_id: student.student_id,
            full_name: student.full_name,
            fee_status: summary.status as 'paid' | 'partial' | 'unpaid',
            fee_category: classData.fee_category?.name || 'No Category',
            total_fee: summary.total_fee,
            paid_amount: summary.paid_amount,
            remaining_amount: summary.remaining_amount,
          };
        })
      );

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

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedClass) return;

    // Check if accounting session is active before allowing payment
    if (!isSessionActive) {
      InAppNotificationService.error('Please activate your accounting session first. Go to Accountant Dashboard to activate.');
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      InAppNotificationService.error('Please enter a valid payment amount');
      return;
    }

    // Validate payment amount doesn't exceed remaining due
    if (amount > selectedStudent.remaining_amount) {
      InAppNotificationService.error('Payment amount cannot exceed remaining due amount');
      return;
    }

    const finalPaymentMethod = paymentMethod === 'cash' ? 'cash' : customPaymentMethod;

    setSubmittingPayment(true);
    try {
      await api.post('/fee-payments', {
        school_id: authService.getSchoolId(),
        student_id: selectedStudent.id,
        class_id: selectedClass.id,
        amount_paid: amount,
        payment_method: finalPaymentMethod,
        transaction_reference: transactionRef || undefined,
      });

      InAppNotificationService.success('Payment recorded successfully');

      // Reset form
      setPaymentAmount('');
      setCustomPaymentMethod('');
      setTransactionRef('');

      // Refresh student data
      if (selectedClass) {
        await loadStudentsForClass(selectedClass);
      }

      // Refresh current student data
      try {
        const summary = await api.get(`/fee-payments/student/${selectedStudent.id}/summary`);
        setSelectedStudent(prev => prev ? {
          ...prev,
          fee_status: summary.status as 'paid' | 'partial' | 'unpaid',
          paid_amount: summary.paid_amount,
          remaining_amount: summary.remaining_amount,
        } : null);
      } catch (e) {
        // Ignore
      }

    } catch (error) {
      InAppNotificationService.error('Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (selectedStudent) {
    return (
      <div className="min-h-screen p-8 bg-secondary-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-primary-900">
              Fee Management - {selectedStudent.full_name}
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadVoucher}
                disabled={downloadingVoucher}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {downloadingVoucher ? 'Downloading...' : 'Download Voucher'}
              </button>
              <button
                onClick={handlePrintVoucher}
                disabled={downloadingVoucher}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-white border border-primary-300 hover:bg-primary-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {downloadingVoucher ? 'Loading...' : 'Print Voucher'}
              </button>
              <button
                onClick={() => setSelectedStudent(null)}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
              >
                Back to Students
              </button>
            </div>
          </div>

          {/* Fee Management Modal Content */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Student Information</h3>
                <div className="space-y-2">
                  <p><strong>Name:</strong> {selectedStudent.full_name}</p>
                  <p><strong>Student ID:</strong> {selectedStudent.student_id}</p>
                  <p><strong>Class:</strong> {selectedClass?.class_name}</p>
                  <p><strong>Fee Category:</strong> {selectedStudent.fee_category}</p>
                  {selectedClass?.fee_category?.components && selectedClass.fee_category.components.length > 0 && (
                    <div className="mt-2">
                      <h4 className="font-medium">Category Components</h4>
                      <ul className="text-sm list-disc list-inside">
                        {selectedClass.fee_category.components.map((c: any, idx: number) => (
                          <li key={idx}>{c.name || 'Component'}: ${Number(c.amount || 0).toFixed(2)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Fee Summary</h3>
                <div className="space-y-2">
                  <p><strong>Total Fee:</strong> ${selectedStudent.total_fee}</p>
                  <p><strong>Paid Amount:</strong> ${selectedStudent.paid_amount}</p>
                  <p><strong>Remaining:</strong> ${selectedStudent.remaining_amount}</p>
                  <p><strong>Status:</strong>
                    <span className={`ml-2 px-2 py-1 rounded text-sm ${getStatusColor(selectedStudent.fee_status)}`}>
                      {getStatusText(selectedStudent.fee_status)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Form */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Record Payment</h3>
              <form onSubmit={handlePaymentSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter amount"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Method *</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => {
                        setPaymentMethod(e.target.value);
                        if (e.target.value === 'cash') {
                          setCustomPaymentMethod('');
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="online">Online Payment</option>
                      <option value="cheque">Cheque</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Specific payment method input handled below with datalist (avoid duplicate) */}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Transaction Reference</label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional transaction reference"
                  />
                </div>

                {/* When non-cash, show specific payment method name input with suggestions */}
                {paymentMethod !== 'cash' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Specific Payment Method *</label>
                    <input
                      type="text"
                      list="savedPaymentMethods"
                      value={customPaymentMethod}
                      onChange={(e) => setCustomPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., JazzCash, EasyPaisa, HBL Online"
                      required
                    />
                    <datalist id="savedPaymentMethods">
                      {savedPaymentMethods.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={submittingPayment}
                    className="px-6 py-2"
                  >
                    {submittingPayment ? 'Recording...' : 'Record Payment'}
                  </Button>
                </div>
              </form>
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

          {loading ? (
            <div className="text-center py-8">Loading students...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {students.map((student) => (
                <div
                  key={student.id}
                  className={`bg-white rounded-lg shadow-md p-4 border-l-4 cursor-pointer hover:shadow-lg transition-shadow ${getStatusColor(student.fee_status)}`}
                  onClick={() => setSelectedStudent(student)}
                >
                  <h3 className="font-semibold text-lg mb-2">{student.full_name}</h3>
                  <p className="text-sm text-gray-600 mb-1">ID: {student.student_id}</p>
                  <p className="text-sm text-gray-600 mb-2">{student.fee_category}</p>
                  <div className="text-sm">
                    <p>Total: ${student.total_fee}</p>
                    <p>Paid: ${student.paid_amount}</p>
                    <p>Remaining: ${student.remaining_amount}</p>
                  </div>
                  <div className="mt-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(student.fee_status)}`}>
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

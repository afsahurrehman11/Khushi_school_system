/**
 * Student Fee Overview Tab Component - M5 Implementation
 * Displays fee breakdown, payment form, and voucher buttons
 */

import React, { useState, useEffect } from 'react';
import { StudentFeeOverview } from '../../../types';
import studentFeeService from '../../../services/studentFees';
import { studentsService } from '../../../services/students';
import { api } from '../../../utils/api';
import logger from '../../../utils/logger';
import Button from '../../../components/Button';

// Cache for class fee assignments and fee categories (5 min TTL)
const dataCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedData = async (key: string, fetcher: () => Promise<any>) => {
  const now = Date.now();
  const cached = dataCache.get(key);
  
  if (cached && cached.expiry > now) {
    logger.debug('FEE', `Cache hit for ${key}`);
    return cached.data;
  }
  
  logger.debug('FEE', `Cache miss for ${key}, fetching...`);
  const data = await fetcher();
  dataCache.set(key, { data, expiry: now + CACHE_TTL });
  return data;
};

interface FeeOverviewTabProps {
  studentId: string;
  studentName?: string;
  studentCode?: string;
  className?: string;
  classId?: string;
  onPrintVoucher?: () => Promise<void> | (() => void);
  onRefresh?: () => void;
  onPaymentSuccess?: () => void; // Alias for onRefresh for parent flexibility
}

const FeeOverviewTab: React.FC<FeeOverviewTabProps> = ({
  studentId,
  studentName,
  studentCode,
  className,
  classId,
  onRefresh,
  onPaymentSuccess
}) => {
  const [overview, setOverview] = useState<StudentFeeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Payment form state (removed - overview is read-only)
  // Scholarship edit state
  const [editingScholarship, setEditingScholarship] = useState(false);
  const [scholarshipValue, setScholarshipValue] = useState('');
  const [studentDetails, setStudentDetails] = useState<any | null>(null);
  const [feeCategoryComponentsState, setFeeCategoryComponentsState] = useState<{ component_name: string; amount: number }[] | null>(null);
  const [fetchCategoryError, setFetchCategoryError] = useState<string | null>(null);

  // Prevent duplicate API calls (React 18 StrictMode issue)
  const loadingRef = React.useRef(false);

  const loadOverview = async () => {
    // Prevent concurrent calls
    if (loadingRef.current) {
      logger.debug('FEE', 'Overview load already in progress, skipping duplicate call');
      return;
    }

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      
      const data = await studentFeeService.getFeeOverview(studentId);
      setOverview(data);
      setScholarshipValue(data.scholarship_percent.toString());
      
      // use student info returned by overview to avoid extra DB call
      try {
        if ((data as any)?.student) {
          setStudentDetails((data as any).student);
        } else {
          const s = await studentsService.getStudent(studentId);
          setStudentDetails(s);
        }
      } catch (e) {
        setStudentDetails(null);
      }
      
      // Try to fetch fee category details (if assigned) to show full breakdown
      try {
      setFetchCategoryError(null);
      const d = data as any;
      let cid = d?.fee_category?.category_id || d?.fee_category?.id || d?.current_month_fee?.category_id || d?.current_month_fee?.fee_category_id || d?.current_month_fee?.fee_category?.id;

        // If we don't have a category id in the overview, try the class assignment (if classId prop provided)
        if (!cid && classId) {
          try {
            logger.info('FEE', 'Fetching class assignment for classId: ' + classId);
            const assignment = await getCachedData(
              `class-assignment:${classId}`,
              () => api.get(`/class-fee-assignments/classes/${classId}/active`)
            );
            cid = assignment?.category_id || assignment?.categoryId || assignment?.category?.id || assignment?.category_id || null;
            logger.debug('FEE', 'Class assignment result: ' + JSON.stringify(assignment));
          } catch (ae) {
            logger.debug('FEE', 'Class assignment fetch failed: ' + String(ae));
          }
        }

        if (cid) {
          logger.info('FEE', `Fetching fee category ${cid} for student ${studentId}`);
          const cat = await getCachedData(
            `fee-category:${cid}`,
            () => api.get(`/fee-categories/${cid}`)
          );
          const catData = cat?.components ? cat : (cat?.data ? cat.data : cat);
          // detect components under various possible keys
          const rawComponents = catData?.components || catData?.attributes || catData?.items || catData?.components_list || [];
          if (Array.isArray(rawComponents) && rawComponents.length > 0) {
            const mapped = rawComponents.map((c: any) => ({
              component_name: c.component_name || c.name || c.attribute || c.label || c.key || 'Unknown',
              amount: Number(c.amount ?? c.value ?? c.fee ?? 0)
            }));
            setFeeCategoryComponentsState(mapped);
          } else {
            setFeeCategoryComponentsState(null);
            setFetchCategoryError('No components found on fee category');
          }
        } else if ((data as any)?.fee_category?.components) {
          const d2 = data as any;
          setFeeCategoryComponentsState((d2.fee_category.components || []).map((c: any) => ({ component_name: c.component_name || c.name || 'Unknown', amount: Number(c.amount || 0) })));
        } else if ((data as any)?.current_month_fee?.components) {
          const d3 = data as any;
          setFeeCategoryComponentsState((d3.current_month_fee.components || []).map((c: any) => ({ component_name: c.component_name || c.name || 'Unknown', amount: Number(c.amount || 0) })));
        } else {
          setFeeCategoryComponentsState(null);
          setFetchCategoryError('No fee category assigned to student or class');
        }
      } catch (e: any) {
        logger.error('FEE', 'Failed to fetch fee category: ' + String(e));
        setFeeCategoryComponentsState(null);
        setFetchCategoryError(e?.message || String(e));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load fee overview');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  useEffect(() => {
    // Reset loading ref when student changes
    loadingRef.current = false;
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Listen for external payment events so the UI and parent can refresh status immediately
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const sid = e?.detail?.studentId || e?.detail?.student_id;
        if (sid && String(sid) === String(studentId)) {
          loadOverview();
          onRefresh?.();
        }
      } catch (err) {
        // ignore
      }
    };

    window.addEventListener('feeRecorded', handler as EventListener);
    return () => window.removeEventListener('feeRecorded', handler as EventListener);
  }, [studentId]);

  // Fetch student details alongside fee overview
  const loadStudentDetails = async () => {
    try {
      const s = await studentsService.getStudent(studentId);
      setStudentDetails(s);
    } catch (e) {
      setStudentDetails(null);
    }
  };

  // Payment recording removed from Overview tab (use Accountant -> Record Payment)

  const handleScholarshipUpdate = async () => {
    const percent = parseFloat(scholarshipValue);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      alert('Please enter a valid percentage between 0 and 100');
      return;
    }

    try {
      await studentFeeService.updateScholarship(studentId, percent);
      setEditingScholarship(false);
      await loadOverview();
      await loadStudentDetails();
      onRefresh?.();
      onPaymentSuccess?.();
    } catch (err: any) {
      alert(err.message || 'Failed to update scholarship');
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return 'bg-green-100 text-green-800';
      case 'PARTIAL': return 'bg-yellow-100 text-yellow-800';
      case 'UNPAID': return 'bg-red-100 text-red-800';
      case 'OVERDUE': return 'bg-red-200 text-red-900';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading fee overview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <Button onClick={loadOverview}>Retry</Button>
      </div>
    );
  }

  if (!overview) return null;

  const currentFee = overview.current_month_fee;

  // Fee category components prefer backend-fetched state, fallback to overview/currentFee
  const feeCategoryComponents: { component_name: string; amount: number }[] | null = (
    feeCategoryComponentsState || (overview as any)?.fee_category?.components || (currentFee as any)?.components || null
  );

  return (
    <div className="space-y-6">
      {/* Student Information Card */}
      <div className="bg-slate-50 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Student Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col">
            <p className="text-sm text-gray-500">Name</p>
            <p className="font-medium text-gray-900 truncate">{studentName}</p>
          </div>
          <div className="flex flex-col">
            <p className="text-sm text-gray-500">Student ID</p>
            <p className="font-medium text-gray-900">{studentCode}</p>
          </div>
          <div className="flex flex-col">
            <p className="text-sm text-gray-500">Class</p>
            <p className="font-medium text-gray-900">{className}</p>
          </div>
          <div className="flex flex-col">
            <p className="text-sm text-gray-500">Scholarship %</p>
            {editingScholarship ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scholarshipValue}
                  onChange={(e) => setScholarshipValue(e.target.value)}
                  className="w-20 px-2 py-1 border rounded text-sm"
                />
                <button onClick={handleScholarshipUpdate} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Save</button>
                <button onClick={() => setEditingScholarship(false)} className="px-3 py-1 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">{overview.scholarship_percent}%</p>
                <button 
                  onClick={() => setEditingScholarship(true)} 
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Additional student details */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
          <div>
            <p className="text-sm text-gray-500">Father / Guardian</p>
            <p className="font-medium text-gray-900">{studentDetails?.guardian_info?.father_name || studentDetails?.father_name || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Registration #</p>
            <p className="font-medium text-gray-900">{studentDetails?.registration_number || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Parent CNIC</p>
            <p className="font-medium text-gray-900">{studentDetails?.parent_cnic || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Guardian Contact</p>
            <p className="font-medium text-gray-900">{studentDetails?.guardian_contact || studentDetails?.guardian_info?.guardian_contact || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Phone</p>
            <p className="font-medium text-gray-900">{studentDetails?.contact_info?.phone || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Address</p>
            <p className="font-medium text-gray-900">{studentDetails?.address || '—'}</p>
          </div>
        </div>
      </div>

      {/* Fee Breakdown Card */}
      {currentFee ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Current Month Fee ({currentFee.month_name} {currentFee.year})
            </h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(currentFee.status)}`}>
              {currentFee.status}
            </span>
          </div>
          
          <div className="flex justify-center">
            <div className="w-full max-w-3xl min-h-[340px] bg-indigo-50 rounded p-6 border text-base">
              <h4 className="text-base text-gray-800 mb-3 font-semibold">Current Month Fee ({currentFee.month_name} {currentFee.year})</h4>
                {feeCategoryComponents && feeCategoryComponents.length > 0 && (
                  <div className="mb-4">
                    <h5 className="text-xs text-gray-600 mb-2">Breakdown</h5>
                    <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto mb-2">
                      {feeCategoryComponents.map((c, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white rounded px-3 py-2">
                          <div className="text-gray-700 text-sm">{c.component_name}</div>
                          <div className="font-medium text-gray-900 ml-4 text-sm">{formatCurrency(c.amount)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center border-t pt-2 mt-2 bg-white rounded px-3 py-2">
                      <span className="font-medium text-gray-800">Category Total</span>
                      <span className="font-semibold text-gray-900 text-base">{formatCurrency(feeCategoryComponents.reduce((s, it) => s + (Number(it.amount) || 0), 0))}</span>
                    </div>
                  </div>
                )}
                {fetchCategoryError && (
                  <div className="text-xs text-red-600 mt-2">{fetchCategoryError}</div>
                )}

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-600">Arrears</span>
                    <span className="text-orange-600 font-semibold">{formatCurrency(currentFee.arrears_added || overview.arrears_balance)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-600">Scholarship ({currentFee.scholarship_percent}%)</span>
                    <span className="text-green-600 font-semibold">-{formatCurrency(currentFee.scholarship_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-600">Base Fee</span>
                    <span className="font-semibold">{formatCurrency(currentFee.base_fee)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-600">Amount Paid</span>
                    <span className="text-green-600 font-semibold">{formatCurrency(currentFee.amount_paid)}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="font-medium text-gray-800">Grand Total</span>
                    <span className="font-bold text-blue-900">{formatCurrency(currentFee.final_fee)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="font-medium text-gray-800">Status (this month)</span>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getStatusColor(currentFee.status)}`}>{currentFee.status}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Amount paid is shown in the summary card below to keep UI minimal and consolidated */}
            <div className="mt-6 pt-4 border-t flex items-center justify-between bg-white p-4 rounded">
              <div>
                <p className="text-sm text-gray-500">Remaining Amount</p>
                <p className="font-bold text-2xl text-red-600">{formatCurrency(currentFee.remaining_amount)}</p>
              </div>
            </div>
          </div>
      ) : null}

      {/* Payments removed from Overview tab to keep it minimal and read-only */}

      {/* Fee Summary removed from Overview as requested */}

      {/* Lower action buttons removed to avoid duplication; use top controls only */}
    </div>
  );
};

export default FeeOverviewTab;

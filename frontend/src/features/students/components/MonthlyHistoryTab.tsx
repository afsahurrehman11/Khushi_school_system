/**
 * Monthly History Tab Component - M5 & M6 Implementation
 * Displays monthly fee records in table format with Chart.js visualizations
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { StudentMonthlyFee } from '../../../types';
import studentFeeService from '../../../services/studentFees';

// Lazy load Chart.js components for performance (M8)
const PaymentCharts = lazy(() => import('./PaymentCharts'));

interface MonthlyHistoryTabProps {
  studentId: string;
}

interface FeeDetail extends StudentMonthlyFee {
  payments: any[];
}

const MonthlyHistoryTab: React.FC<MonthlyHistoryTabProps> = ({ studentId }) => {
  const [fees, setFees] = useState<StudentMonthlyFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [selectedFee, setSelectedFee] = useState<FeeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const loadFees = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studentFeeService.getMonthlyFees(studentId, selectedYear, undefined, page, 12);
      setFees(data.fees);
      setTotalPages(Math.ceil(data.total / data.page_size));
    } catch (err: any) {
      setError(err.message || 'Failed to load fee history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFees();
  }, [studentId, page, selectedYear]);

  const loadFeeDetail = async (feeId: string) => {
    try {
      setDetailLoading(true);
      const detail = await studentFeeService.getFeeDetail(feeId);
      setSelectedFee(detail);
    } catch (err: any) {
      console.error('Failed to load fee detail:', err);
    } finally {
      setDetailLoading(false);
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

  if (loading && fees.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading fee history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={loadFees} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Charts Section - Lazy Loaded */}
      <Suspense fallback={
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-500">Loading charts...</span>
          </div>
        </div>
      }>
        <PaymentCharts studentId={studentId} year={selectedYear || currentYear} />
      </Suspense>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Year</label>
            <select
              value={selectedYear || ''}
              onChange={(e) => {
                setSelectedYear(e.target.value ? parseInt(e.target.value) : undefined);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Years</option>
              {years.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Fee History Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Monthly Fee History</h3>
        </div>
        
        {fees.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No fee records found for this period.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Month
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Fee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Paid
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Remaining
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {fees.map((fee) => (
                    <tr key={fee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {fee.month_name} {fee.year}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatCurrency(fee.final_fee)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-green-600">{formatCurrency(fee.amount_paid)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-red-600">{formatCurrency(fee.remaining_amount)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(fee.status)}`}>
                          {fee.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => loadFeeDetail(fee.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fee Detail Modal */}
      {selectedFee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">
                Fee Details - {selectedFee.month_name} {selectedFee.year}
              </h3>
              <button
                onClick={() => setSelectedFee(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {detailLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Fee Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-sm text-gray-500">Base Fee</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(selectedFee.base_fee)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-sm text-gray-500">Scholarship Discount ({selectedFee.scholarship_percent}%)</p>
                    <p className="font-semibold text-green-600">-{formatCurrency(selectedFee.scholarship_amount)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-sm text-gray-500">Fee After Discount</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(selectedFee.fee_after_discount)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-sm text-gray-500">Arrears Added</p>
                    <p className="font-semibold text-orange-600">+{formatCurrency(selectedFee.arrears_added)}</p>
                  </div>
                  <div className="bg-blue-50 rounded p-3">
                    <p className="text-sm text-blue-600">Final Fee</p>
                    <p className="font-bold text-blue-900">{formatCurrency(selectedFee.final_fee)}</p>
                  </div>
                  <div className="bg-gray-50 rounded p-3">
                    <p className="text-sm text-gray-500">Status</p>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedFee.status)}`}>
                      {selectedFee.status}
                    </span>
                  </div>
                  <div className="bg-green-50 rounded p-3">
                    <p className="text-sm text-green-600">Amount Paid</p>
                    <p className="font-semibold text-green-700">{formatCurrency(selectedFee.amount_paid)}</p>
                  </div>
                  <div className="bg-red-50 rounded p-3">
                    <p className="text-sm text-red-600">Remaining</p>
                    <p className="font-semibold text-red-700">{formatCurrency(selectedFee.remaining_amount)}</p>
                  </div>
                </div>

                {/* Payments for this month */}
                {selectedFee.payments && selectedFee.payments.length > 0 && (
                  <div>
                    <h4 className="font-medium text-gray-800 mb-3">Payments</h4>
                    <div className="space-y-2">
                      {selectedFee.payments.map((payment: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                          <div>
                            <p className="font-medium text-gray-900">{formatCurrency(payment.amount)}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(payment.payment_date).toLocaleDateString()} • {payment.payment_method}
                            </p>
                          </div>
                          {payment.transaction_reference && (
                            <p className="text-sm text-gray-500">Ref: {payment.transaction_reference}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyHistoryTab;

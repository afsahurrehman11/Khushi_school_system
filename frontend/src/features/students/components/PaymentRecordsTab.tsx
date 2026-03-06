/**
 * Payment Records Tab Component - M5 Implementation
 * Displays paginated payment history
 */

import React, { useState, useEffect } from 'react';
import { StudentPayment } from '../../../types';
import studentFeeService from '../../../services/studentFees';

interface PaymentRecordsTabProps {
  studentId: string;
}

const PaymentRecordsTab: React.FC<PaymentRecordsTabProps> = ({ studentId }) => {
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  const loadPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studentFeeService.getPayments(studentId, page, pageSize);
      setPayments(data.payments);
      setTotal(data.total);
      setTotalPages(Math.ceil(data.total / data.page_size));
    } catch (err: any) {
      setError(err.message || 'Failed to load payment records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [studentId, page]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      'CASH': 'Cash',
      'BANK_TRANSFER': 'Bank Transfer',
      'ONLINE': 'Online',
      'CHEQUE': 'Cheque',
      'CARD': 'Card',
      'OTHER': 'Other'
    };
    return labels[method] || method;
  };

  const getPaymentMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      'CASH': 'bg-green-100 text-green-800',
      'BANK_TRANSFER': 'bg-blue-100 text-blue-800',
      'ONLINE': 'bg-purple-100 text-purple-800',
      'CHEQUE': 'bg-yellow-100 text-yellow-800',
      'CARD': 'bg-indigo-100 text-indigo-800',
      'OTHER': 'bg-gray-100 text-gray-800'
    };
    return colors[method] || 'bg-gray-100 text-gray-800';
  };

  if (loading && payments.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading payment records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={loadPayments} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with total */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Payment Records</h3>
          <p className="text-sm text-gray-500">Total payments: {total}</p>
        </div>
      </div>

      {/* Payment Records Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {payments.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No payment records found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Month
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reference
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(payment.payment_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {payment.month_name ? `${payment.month_name} ${payment.year}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-green-600">
                          {formatCurrency(payment.amount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPaymentMethodColor(payment.payment_method)}`}>
                          {getPaymentMethodLabel(payment.payment_method)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {payment.transaction_reference || '-'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                    className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    First
                  </button>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setPage(totalPages)}
                    disabled={page === totalPages}
                    className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Summary Card */}
      {payments.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="font-medium text-gray-800 mb-4">Payment Summary</h4>
          <PaymentSummaryStats studentId={studentId} />
        </div>
      )}
    </div>
  );
};

// Payment Summary Stats Sub-component
const PaymentSummaryStats: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const data = await studentFeeService.getPaymentSummary(studentId);
        setSummary(data);
      } catch (err) {
        console.error('Failed to load payment summary:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSummary();
  }, [studentId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return <div className="text-gray-500">Loading summary...</div>;
  }

  if (!summary) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center p-4 bg-blue-50 rounded-lg">
        <p className="text-2xl font-bold text-blue-600">{summary.total_payments}</p>
        <p className="text-sm text-gray-600">Total Payments</p>
      </div>
      <div className="text-center p-4 bg-green-50 rounded-lg">
        <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.total_amount_paid)}</p>
        <p className="text-sm text-gray-600">Total Paid</p>
      </div>
      {Object.entries(summary.payments_by_method || {}).map(([method, amount]) => (
        <div key={method} className="text-center p-4 bg-gray-50 rounded-lg">
          <p className="text-xl font-bold text-gray-700">{formatCurrency(amount as number)}</p>
          <p className="text-sm text-gray-600">{method.replace('_', ' ')}</p>
        </div>
      ))}
    </div>
  );
};

export default PaymentRecordsTab;

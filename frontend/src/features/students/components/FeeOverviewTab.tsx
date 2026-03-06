/**
 * Student Fee Overview Tab Component - M5 Implementation
 * Displays fee breakdown, payment form, and voucher buttons
 */

import React, { useState, useEffect } from 'react';
import { StudentFeeOverview, PaymentMethodType } from '../../../types';
import studentFeeService from '../../../services/studentFees';
import Button from '../../../components/Button';

interface FeeOverviewTabProps {
  studentId: string;
  studentName?: string;
  studentCode?: string;
  className?: string;
  onPrintVoucher?: () => void;
  onRefresh?: () => void;
  onPaymentSuccess?: () => void; // Alias for onRefresh for parent flexibility
}

const FeeOverviewTab: React.FC<FeeOverviewTabProps> = ({
  studentId,
  studentName,
  studentCode,
  className,
  onPrintVoucher,
  onRefresh,
  onPaymentSuccess
}) => {
  const [overview, setOverview] = useState<StudentFeeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  // Scholarship edit state
  const [editingScholarship, setEditingScholarship] = useState(false);
  const [scholarshipValue, setScholarshipValue] = useState('');

  const loadOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await studentFeeService.getFeeOverview(studentId);
      setOverview(data);
      setScholarshipValue(data.scholarship_percent.toString());
    } catch (err: any) {
      setError(err.message || 'Failed to load fee overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [studentId]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overview?.current_month_fee || !paymentAmount) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }

    if (amount > overview.current_month_fee.remaining_amount) {
      setPaymentError(`Amount exceeds remaining balance (${formatCurrency(overview.current_month_fee.remaining_amount)})`);
      return;
    }

    try {
      setSubmitting(true);
      setPaymentError(null);
      
      await studentFeeService.createPayment(
        studentId,
        overview.current_month_fee.id,
        amount,
        paymentMethod,
        transactionRef || undefined
      );
      
      setPaymentSuccess(true);
      setPaymentAmount('');
      setTransactionRef('');
      
      // Refresh data
      await loadOverview();
      onRefresh?.();
      onPaymentSuccess?.();
      
      setTimeout(() => setPaymentSuccess(false), 3000);
    } catch (err: any) {
      setPaymentError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Student Information Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Student Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Name</p>
            <p className="font-medium text-gray-900">{studentName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Student ID</p>
            <p className="font-medium text-gray-900">{studentCode}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Class</p>
            <p className="font-medium text-gray-900">{className}</p>
          </div>
          <div>
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
                <button onClick={handleScholarshipUpdate} className="text-green-600 hover:text-green-800">✓</button>
                <button onClick={() => setEditingScholarship(false)} className="text-red-600 hover:text-red-800">✕</button>
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
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Current Arrears Balance</p>
              <p className="font-semibold text-lg text-orange-600">{formatCurrency(overview.arrears_balance)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Base Fee (Monthly)</p>
              <p className="font-semibold text-lg text-gray-900">{formatCurrency(overview.base_fee)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Fee Breakdown Card */}
      {currentFee && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Current Month Fee ({currentFee.month_name} {currentFee.year})
            </h3>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(currentFee.status)}`}>
              {currentFee.status}
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-500">Base Fee</p>
              <p className="font-semibold text-gray-900">{formatCurrency(currentFee.base_fee)}</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-500">Scholarship ({currentFee.scholarship_percent}%)</p>
              <p className="font-semibold text-green-600">-{formatCurrency(currentFee.scholarship_amount)}</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-500">After Discount</p>
              <p className="font-semibold text-gray-900">{formatCurrency(currentFee.fee_after_discount)}</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-500">Arrears Added</p>
              <p className="font-semibold text-orange-600">+{formatCurrency(currentFee.arrears_added)}</p>
            </div>
            <div className="bg-blue-50 rounded p-3">
              <p className="text-sm text-blue-600">Total Fee</p>
              <p className="font-bold text-blue-900 text-lg">{formatCurrency(currentFee.final_fee)}</p>
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-500">Amount Paid</p>
              <p className="font-semibold text-green-600">{formatCurrency(currentFee.amount_paid)}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Remaining Amount</p>
              <p className="font-bold text-2xl text-red-600">{formatCurrency(currentFee.remaining_amount)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Form Card */}
      {currentFee && currentFee.remaining_amount > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Record Payment</h3>
          
          {paymentSuccess && (
            <div className="mb-4 p-3 bg-green-100 text-green-800 rounded">
              Payment recorded successfully!
            </div>
          )}
          
          {paymentError && (
            <div className="mb-4 p-3 bg-red-100 text-red-800 rounded">
              {paymentError}
            </div>
          )}
          
          <form onSubmit={handlePayment} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min="1"
                max={currentFee.remaining_amount}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder={`Max: ${currentFee.remaining_amount}`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="ONLINE">Online</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reference (Optional)</label>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="Transaction ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting || !paymentAmount}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Processing...' : 'Submit Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Fee Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded">
            <p className="text-2xl font-bold text-gray-900">{overview.fee_summary.total_months}</p>
            <p className="text-sm text-gray-500">Total Months</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded">
            <p className="text-2xl font-bold text-green-600">{overview.fee_summary.paid_months}</p>
            <p className="text-sm text-gray-500">Paid</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded">
            <p className="text-2xl font-bold text-yellow-600">{overview.fee_summary.partial_months}</p>
            <p className="text-sm text-gray-500">Partial</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded">
            <p className="text-2xl font-bold text-red-600">{overview.fee_summary.unpaid_months + overview.fee_summary.overdue_months}</p>
            <p className="text-sm text-gray-500">Unpaid/Overdue</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Total Generated</p>
            <p className="font-semibold">{formatCurrency(overview.fee_summary.total_fees_generated)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Paid</p>
            <p className="font-semibold text-green-600">{formatCurrency(overview.fee_summary.total_paid)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Remaining</p>
            <p className="font-semibold text-red-600">{formatCurrency(overview.fee_summary.total_remaining)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Scholarship Given</p>
            <p className="font-semibold text-blue-600">{formatCurrency(overview.fee_summary.total_scholarship_given)}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <button
          onClick={onPrintVoucher}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Print Fee Voucher
        </button>
        <button
          onClick={onPrintVoucher}
          className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
        >
          Download PDF
        </button>
      </div>
    </div>
  );
};

export default FeeOverviewTab;

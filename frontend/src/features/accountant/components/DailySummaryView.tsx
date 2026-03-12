/**
 * Daily Summary View Component
 * MODULE 4: Comprehensive daily summary for accountants
 * Shows payments, balances, and collection breakdown
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, DollarSign, TrendingUp, CreditCard, Users, 
  RefreshCw, ChevronDown, ChevronUp, Clock, CheckCircle,
  Banknote, Building2, Wallet, GraduationCap
} from 'lucide-react';
import dailyWorkflowService, { DailySummaryResponse } from '../services/dailyWorkflowService';
import logger from '../../../utils/logger';

interface DailySummaryViewProps {
  onRefresh?: () => void;
}

const DailySummaryView: React.FC<DailySummaryViewProps> = ({ onRefresh }) => {
  const [summary, setSummary] = useState<DailySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPayments, setShowPayments] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const fetchSummary = async (date?: string) => {
    setLoading(true);
    setError('');
    
    try {
      const data = await dailyWorkflowService.getDailySummary(date);
      setSummary(data);
      logger.info('📊 DAILY_SUMMARY', `Loaded summary: ${data.payment_count} payments, outstanding: ${data.outstanding_balance}`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err.message || 'Failed to load daily summary';
      setError(msg);
      logger.error('📊 DAILY_SUMMARY', `Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary(selectedDate);
  }, [selectedDate]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMethodIcon = (method: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'Cash': <Banknote className="w-4 h-4 text-success-600" />,
      'JazzCash': <Wallet className="w-4 h-4 text-rose-600" />,
      'EasyPaisa': <Wallet className="w-4 h-4 text-emerald-600" />,
      'Bank': <Building2 className="w-4 h-4 text-blue-600" />,
      'Online': <CreditCard className="w-4 h-4 text-purple-600" />,
    };
    return iconMap[method] || <DollarSign className="w-4 h-4 text-gray-600" />;
  };

  const getMethodColor = (method: string): string => {
    const colorMap: Record<string, string> = {
      'Cash': 'bg-success-100 text-success-700 border-success-200',
      'JazzCash': 'bg-rose-100 text-rose-700 border-rose-200',
      'EasyPaisa': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Bank': 'bg-blue-100 text-blue-700 border-blue-200',
      'Online': 'bg-purple-100 text-purple-700 border-purple-200',
    };
    return colorMap[method] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const handleRefresh = () => {
    fetchSummary(selectedDate);
    onRefresh?.();
  };

  if (loading && !summary) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500">Loading daily summary...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">📊 Daily Summary</h3>
              <p className="text-primary-100 text-sm">
                {summary?.accountant_name || 'Loading...'} • {selectedDate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
            />
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 hover:bg-white/10 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            ❌ {error}
          </div>
        </div>
      ) : summary ? (
        <>
          {/* Session Status */}
          <div className="px-6 py-3 bg-gray-50 border-b flex items-center gap-2">
            <span className="text-sm text-gray-600">Session Status:</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              summary.session_status === 'OPEN' 
                ? 'bg-success-100 text-success-700' 
                : summary.session_status === 'CLOSED'
                ? 'bg-gray-100 text-gray-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {summary.session_status === 'OPEN' ? '🟢 Active' : summary.session_status === 'CLOSED' ? '🔴 Closed' : '⚪ No Session'}
            </span>
          </div>

          {/* Summary Cards */}
          <div className="p-6 space-y-6">
            {/* Balance Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-blue-50 rounded-xl p-4 border border-blue-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-blue-600 font-medium">Opening Balance</span>
                </div>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(summary.opening_balance)}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="bg-success-50 rounded-xl p-4 border border-success-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-success-600" />
                  <span className="text-xs text-success-600 font-medium">Collected Today</span>
                </div>
                <p className="text-xl font-bold text-success-700">{formatCurrency(summary.total_collected_today)}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-purple-50 rounded-xl p-4 border border-purple-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-purple-600" />
                  <span className="text-xs text-purple-600 font-medium">Paid to Principal</span>
                </div>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(summary.total_paid_to_principal_today)}</p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-amber-50 rounded-xl p-4 border border-amber-100"
              >
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  <span className="text-xs text-amber-600 font-medium">Outstanding</span>
                </div>
                <p className="text-xl font-bold text-amber-700">{formatCurrency(summary.outstanding_balance)}</p>
              </motion.div>
            </div>

            {/* Collection by Method */}
            {Object.keys(summary.collection_by_method).length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-gray-500" />
                  💳 Collection by Payment Method
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(summary.collection_by_method).map(([method, amount], index) => (
                    <motion.div
                      key={method}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className={`rounded-lg p-3 border ${getMethodColor(method)}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {getMethodIcon(method)}
                        <span className="text-sm font-medium">{method}</span>
                      </div>
                      <p className="font-bold">{formatCurrency(amount)}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Collection by Class */}
            {Object.keys(summary.collection_by_class).length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-gray-500" />
                  🎓 Collection by Class
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(summary.collection_by_class)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([className, amount], index) => (
                      <motion.div
                        key={className}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{className}</span>
                          <span className="font-semibold text-gray-800">{formatCurrency(amount)}</span>
                        </div>
                      </motion.div>
                    ))}
                </div>
              </div>
            )}

            {/* Payments List */}
            <div>
              <button
                onClick={() => setShowPayments(!showPayments)}
                className="flex items-center justify-between w-full py-3 text-left"
              >
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-500" />
                  📝 Today's Payments ({summary.payment_count})
                </h4>
                {showPayments ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>
              
              <AnimatePresence>
                {showPayments && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    {summary.payments.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        No payments recorded yet today
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                        {summary.payments.map((payment, index) => (
                          <motion.div
                            key={payment.payment_id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02 }}
                            className="bg-gray-50 rounded-lg p-3 border border-gray-200 hover:border-primary-200 transition"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-medium text-gray-800">{payment.student_name}</p>
                                <p className="text-sm text-gray-500">
                                  {payment.student_class} • {formatTime(payment.timestamp)}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-success-600">{formatCurrency(payment.amount)}</p>
                                <p className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                                  {getMethodIcon(payment.payment_method)}
                                  {payment.payment_method}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Principal Payments Today */}
            {summary.principal_payments_today.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  💸 Principal Payments Today
                </h4>
                <div className="space-y-2">
                  {summary.principal_payments_today.map((pp) => (
                    <div
                      key={pp.id}
                      className="flex items-center justify-between bg-blue-50 rounded-lg p-3 border border-blue-100"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          pp.status === 'APPROVED' 
                            ? 'bg-success-100 text-success-700' 
                            : pp.status === 'PENDING'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-danger-100 text-danger-700'
                        }`}>
                          {pp.status}
                        </span>
                        <span className="text-sm text-gray-600">{pp.payment_method}</span>
                      </div>
                      <span className="font-bold text-blue-700">{formatCurrency(pp.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};

export default DailySummaryView;

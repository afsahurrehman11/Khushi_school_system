/**
 * Cash Dashboard Widget
 * Shows current cash session status with payment method breakdown
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingUp, PieChart, Calendar } from 'lucide-react';
import { useCashSession } from '../hooks/useCashSession';

interface CashDashboardWidgetProps {
  className?: string;
}

const CashDashboardWidget: React.FC<CashDashboardWidgetProps> = ({ className = '' }) => {
  const { session, summary, loading } = useCashSession();

  if (loading && !session) {
    return (
      <div className={`bg-white rounded-xl shadow-soft p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const currentBalance = session.current_balance || 0;
  const openingBalance = session.opening_balance || 0;
  const collected = currentBalance - openingBalance;
  const methods = session.current_balance_by_method || {};

  // Sort methods by amount (descending)
  const sortedMethods = Object.entries(methods).sort((a, b) => b[1] - a[1]);

  // Get total transactions
  const totalTransactions = summary?.total_transactions || 0;

  // Color palette for payment methods
  const getMethodColor = (index: number) => {
    const colors = [
      'bg-emerald-500',
      'bg-blue-500',
      'bg-purple-500',
      'bg-amber-500',
      'bg-rose-500',
      'bg-cyan-500',
      'bg-indigo-500',
      'bg-pink-500'
    ];
    return colors[index % colors.length];
  };

  const getMethodTextColor = (index: number) => {
    const colors = [
      'text-emerald-600',
      'text-blue-600',
      'text-purple-600',
      'text-amber-600',
      'text-rose-600',
      'text-cyan-600',
      'text-indigo-600',
      'text-pink-600'
    ];
    return colors[index % colors.length];
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br from-white to-primary-50 rounded-xl shadow-lg border border-primary-100 ${className}`}
    >
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary-100 p-3 rounded-full">
              <Wallet className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-secondary-900">Cash Session</h3>
              <p className="text-sm text-secondary-600 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(session.started_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            session.status === 'active' 
              ? 'bg-success-100 text-success-700' 
              : 'bg-gray-100 text-gray-700'
          }`}>
            {session.status === 'active' ? '🟢 Active' : '⚪ Closed'}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-secondary-600 mb-1">Opening Balance</p>
            <p className="text-2xl font-bold text-secondary-900">PKR {openingBalance.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-success-50 to-success-100 rounded-lg p-4 border border-success-200">
            <p className="text-xs text-success-700 mb-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Collected Today
            </p>
            <p className="text-2xl font-bold text-success-700">PKR {collected.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-xs text-secondary-600 mb-1">Current Balance</p>
            <p className="text-2xl font-bold text-primary-600">PKR {currentBalance.toLocaleString()}</p>
          </div>
        </div>

        {/* Transactions Count */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-secondary-600">Transactions Today</span>
            <span className="font-semibold text-secondary-900">{totalTransactions}</span>
          </div>
        </div>

        {/* Payment Method Breakdown */}
        {sortedMethods.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-secondary-600" />
              <h4 className="font-semibold text-secondary-900">Payment Breakdown</h4>
            </div>
            
            <div className="space-y-3">
              {sortedMethods.map(([method, amount], index) => {
                const percentage = currentBalance > 0 ? (amount / currentBalance) * 100 : 0;
                const methodCount = summary?.breakdown_by_method?.[method]?.count || 0;
                
                return (
                  <div key={method} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getMethodColor(index)}`}></div>
                        <span className="font-medium text-secondary-700">{method}</span>
                        <span className="text-xs text-secondary-500">({methodCount} txn)</span>
                      </div>
                      <span className={`font-bold ${getMethodTextColor(index)}`}>
                        PKR {amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className={`h-full ${getMethodColor(index)}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No collections message */}
        {sortedMethods.length === 0 && (
          <div className="text-center py-6 text-secondary-500">
            <p className="text-sm">No collections yet today</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CashDashboardWidget;

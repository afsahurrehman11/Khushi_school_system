/**
 * Accountant Ledger Viewer
 * MODULE 2: Displays the accountant's ledger entries
 * Shows debit/credit transactions with filtering
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Book, ArrowDownRight, ArrowUpRight, Filter, RefreshCw, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { accountingService, LedgerEntry } from '../services/accountingService';
import { InAppNotificationService } from '../services/InAppNotificationService';
import logger from '../../../utils/logger';

interface LedgerViewerProps {
  sessionId?: string;
  className?: string;
}

const LedgerViewer: React.FC<LedgerViewerProps> = ({ sessionId, className = '' }) => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [transactionFilter, setTransactionFilter] = useState<string | undefined>(undefined);
  
  const loadEntries = async () => {
    logger.info('ACCOUNTING', '📖 Loading ledger entries...');
    setLoading(true);
    try {
      const response = await accountingService.getLedger({
        session_id: sessionId,
        transaction_type: transactionFilter,
        page_size: 100,
      });
      setEntries(response.entries || []);
    } catch (error: any) {
      logger.error('ACCOUNTING', `❌ Failed to load ledger: ${error.message}`);
      InAppNotificationService.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    loadEntries();
  }, [sessionId, transactionFilter]);
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-PK', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };
  
  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'STUDENT_PAYMENT':
        return <ArrowDownRight className="w-4 h-4 text-green-600" />;
      case 'PAY_TO_PRINCIPAL':
        return <ArrowUpRight className="w-4 h-4 text-red-600" />;
      case 'ADJUSTMENT':
        return <Filter className="w-4 h-4 text-blue-600" />;
      default:
        return <Book className="w-4 h-4 text-gray-600" />;
    }
  };
  
  const getTransactionLabel = (type: string) => {
    const labels: Record<string, string> = {
      'STUDENT_PAYMENT': 'Student Payment',
      'PAY_TO_PRINCIPAL': 'Pay to Principal',
      'ADJUSTMENT': 'Adjustment',
    };
    return labels[type] || type;
  };
  
  // Calculate totals
  const totalCredit = entries.reduce((sum, e) => sum + (e.credit || 0), 0);
  const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const netBalance = totalCredit - totalDebit;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div 
        className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Book className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Ledger</h3>
              <p className="text-emerald-100 text-sm">{entries.length} transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); loadEntries(); }} 
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Summary Bar */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b border-gray-100">
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase">Total Credit</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(totalCredit)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase">Total Debit</p>
                <p className="text-lg font-bold text-red-600">{formatCurrency(totalDebit)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 uppercase">Net Balance</p>
                <p className={`text-lg font-bold ${netBalance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(netBalance)}
                </p>
              </div>
            </div>
            
            {/* Filter Tabs */}
            <div className="px-4 pt-3 pb-2 border-b border-gray-100">
              <div className="flex gap-2 overflow-x-auto">
                <button
                  onClick={() => setTransactionFilter(undefined)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    !transactionFilter
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTransactionFilter('STUDENT_PAYMENT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    transactionFilter === 'STUDENT_PAYMENT'
                      ? 'bg-green-100 text-green-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Student Payments
                </button>
                <button
                  onClick={() => setTransactionFilter('PAY_TO_PRINCIPAL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    transactionFilter === 'PAY_TO_PRINCIPAL'
                      ? 'bg-red-100 text-red-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  Principal Payments
                </button>
              </div>
            </div>
            
            {/* Entries List */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse bg-gray-100 h-12 rounded"></div>
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <div className="text-center py-8">
                  <Book className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No ledger entries found</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-green-600 uppercase">Credit</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-red-600 uppercase">Debit</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {entries.map((entry, index) => (
                      <motion.tr
                        key={entry.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatTime(entry.created_at)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(entry.transaction_type)}
                            <span className="text-sm font-medium text-gray-700">
                              {getTransactionLabel(entry.transaction_type)}
                            </span>
                          </div>
                          {entry.description && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">
                              {entry.description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.credit > 0 && (
                            <span className="text-green-600 font-medium">
                              +{formatCurrency(entry.credit)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {entry.debit > 0 && (
                            <span className="text-red-600 font-medium">
                              -{formatCurrency(entry.debit)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${
                            entry.balance_after >= 0 ? 'text-blue-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(entry.balance_after)}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default LedgerViewer;

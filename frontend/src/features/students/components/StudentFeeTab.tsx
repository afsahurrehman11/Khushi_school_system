/**
 * Student Fee Tab - Main Container Component
 * M5 Implementation - Fee History UI
 * 
 * Tab structure:
 * - Overview: Current fee status, scholarship, payment form
 * - Monthly History: Fee records by month with charts
 * - Payment Records: Detailed payment history
 */

import React, { useState, Suspense, lazy } from 'react';

// Eager load FeeOverviewTab as it's the default tab
import FeeOverviewTab from './FeeOverviewTab';

// Lazy load other tabs for performance (M8)
const MonthlyHistoryTab = lazy(() => import('./MonthlyHistoryTab'));
const PaymentRecordsTab = lazy(() => import('./PaymentRecordsTab'));

interface StudentFeeTabProps {
  studentId: string;
  studentName?: string;
  onPaymentSuccess?: () => void;
}

type TabType = 'overview' | 'history' | 'payments';

const StudentFeeTab: React.FC<StudentFeeTabProps> = ({ studentId, studentName, onPaymentSuccess }) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [refreshKey, setRefreshKey] = useState(0);

  // Callback to refresh tabs after payment/update
  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
    // Notify parent if provided
    try { onPaymentSuccess?.(); } catch (e) { /* safe noop */ }
  };

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: '📊' },
    { id: 'history' as TabType, label: 'Monthly History', icon: '📅' },
    { id: 'payments' as TabType, label: 'Payment Records', icon: '💰' },
  ];

  const TabLoadingFallback = () => (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span className="ml-3 text-gray-600">Loading...</span>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      {studentName && (
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg">
          <h2 className="text-xl font-semibold">Fee Management</h2>
          <p className="text-blue-100 text-sm">Student: {studentName}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <nav className="flex -mb-px" aria-label="Fee Management Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 py-4 px-6 text-sm font-medium 
                border-b-2 transition-colors duration-200
                ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }
              `}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <Suspense fallback={<TabLoadingFallback />}>
          {activeTab === 'overview' && (
            <FeeOverviewTab 
              key={`overview-${refreshKey}`}
              studentId={studentId} 
              onPaymentSuccess={handleRefresh}
            />
          )}
          {activeTab === 'history' && (
            <MonthlyHistoryTab 
              key={`history-${refreshKey}`}
              studentId={studentId} 
            />
          )}
          {activeTab === 'payments' && (
            <PaymentRecordsTab 
              key={`payments-${refreshKey}`}
              studentId={studentId} 
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default StudentFeeTab;

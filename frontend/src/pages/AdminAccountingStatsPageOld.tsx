/**
 * Unified Accounting Dashboard - MODULES 3, 4, 5
 * Merged Finance Dashboard + Finance Reports + Admin Accounting Statistics
 * Route: /dashboard/admin/accounting-stats
 * 
 * Sections:
 * - Accounting Operations
 * - Financial Overview
 * - Visual Analytics
 * - Reports & CSV Export
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign,
  TrendingUp,
  Users,
  Send,
  Clock,
  RefreshCw,
  BarChart3,
  PieChart as PieChartIcon,
  Filter,
  ChevronLeft,
  ChevronRight,
  Activity,
  Building2,
  Download,
  FileText,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { 
  accountingStatsService, 
  AdminGlobalStats, 
  AccountantPerformanceRow,
  ActivityTimelineItem,
  StatsFilters,
  PaginatedResponse 
} from '../services/accountingStatsService';
import { financeService, FinanceSummary, MonthlyCollectionResponse, ClassRevenueResponse, AccountantPerformanceResponse, OutstandingFeesDistribution } from '../services/financeService';
import logger from '../utils/logger';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658', '#ff7300'];

// Loading skeleton
const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 300 }) => (
  <div className="bg-white rounded-xl shadow-sm p-6 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
    <div className="bg-gray-100 rounded" style={{ height }}></div>
  </div>
);



// Lazy loaded chart component
interface LazyChartProps {
  children: React.ReactNode;
  onVisible?: () => void;
}

const LazyChart: React.FC<LazyChartProps> = ({ children, onVisible }) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          logger.info('ADMIN_STATS', '⚡ Lazy loading charts');
          setIsVisible(true);
          onVisible?.();
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, [onVisible]);
  
  return (
    <div ref={ref}>
      {isVisible ? children : <ChartSkeleton />}
    </div>
  );
};

// Filters Component
interface FiltersProps {
  filters: StatsFilters;
  onFilterChange: (filters: StatsFilters) => void;
  onApply: () => void;
}

const FiltersPanel: React.FC<FiltersProps> = ({ filters, onFilterChange, onApply }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-gray-600" />
        <h3 className="font-semibold text-gray-800">Filters</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
          <input
            type="date"
            value={filters.date_from || ''}
            onChange={(e) => onFilterChange({ ...filters, date_from: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
          <input
            type="date"
            value={filters.date_to || ''}
            onChange={(e) => onFilterChange({ ...filters, date_to: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={onApply}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

// Pagination Component
interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange }) => (
  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-b-xl">
    <div className="text-sm text-gray-600">
      Page {page} of {totalPages}
    </div>
    <div className="flex gap-2">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  </div>
);

const AdminAccountingStatsPage: React.FC = () => {
  // Existing stats state
  const [stats, setStats] = useState<AdminGlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<StatsFilters>({});
  
  // Finance Dashboard state
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyCollectionResponse | null>(null);
  const [classRevenue, setClassRevenue] = useState<ClassRevenueResponse | null>(null);
  const [accountantPerf, setAccountantPerf] = useState<AccountantPerformanceResponse | null>(null);
  const [outstandingDist, setOutstandingDist] = useState<OutstandingFeesDistribution[]>([]);
  
  // Report export state
  const [reportFilters, setReportFilters] = useState<any>({});
  const [exporting, setExporting] = useState<string | null>(null);
  
  // Performance table state
  const [perfData, setPerfData] = useState<PaginatedResponse<AccountantPerformanceRow> | null>(null);
  const [perfPage, setPerfPage] = useState(1);
  const [perfLoading, setPerfLoading] = useState(false);
  
  // Activity timeline state
  const [timeline, setTimeline] = useState<PaginatedResponse<ActivityTimelineItem> | null>(null);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineLoading, setTimelineLoading] = useState(false);
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'overview' | 'finance' | 'reports'>('overview');

  const loadStats = useCallback(async () => {
    logger.info('ADMIN_STATS', '📊 Loading unified accounting dashboard');
    
    try {
      const [data, summaryData, monthlyCollData, classRevData, accountantPerfData, outstandingDistData] = await Promise.all([
        accountingStatsService.getAdminGlobalStats(
          filters.date_from,
          filters.date_to,
          12
        ),
        financeService.getSummary(),
        financeService.getMonthlyCollection(12),
        financeService.getClassRevenue(),
        financeService.getAccountantPerformance(),
        financeService.getOutstandingDistribution(),
      ]);
      
      setStats(data);
      setFinanceSummary(summaryData);
      setMonthlyData(monthlyCollData);
      setClassRevenue(classRevData);
      setAccountantPerf(accountantPerfData);
      setOutstandingDist(outstandingDistData);
      
      logger.info('ADMIN_STATS', '📊 Dashboard data loaded and charts rendering');
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Failed to load stats: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [filters.date_from, filters.date_to]);

  const loadPerformanceTable = useCallback(async (page: number) => {
    logger.info('ADMIN_STATS', '⚡ Lazy loading statistics table');
    setPerfLoading(true);
    
    try {
      const data = await accountingStatsService.getAccountantPerformance(
        page,
        20,
        'total_collected',
        'desc',
        filters
      );
      setPerfData(data);
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Failed to load performance: ${error.message}`);
    } finally {
      setPerfLoading(false);
    }
  }, [filters]);

  const loadTimeline = useCallback(async (page: number) => {
    logger.info('ADMIN_STATS', '🕒 Loading activity timeline');
    setTimelineLoading(true);
    
    try {
      const data = await accountingStatsService.getActivityTimeline(
        page,
        20,
        undefined,
        filters
      );
      setTimeline(data);
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Failed to load timeline: ${error.message}`);
    } finally {
      setTimelineLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadPerformanceTable(perfPage);
  }, [perfPage, loadPerformanceTable]);

  useEffect(() => {
    loadTimeline(timelinePage);
  }, [timelinePage, loadTimeline]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      loadStats(),
      loadPerformanceTable(1),
      loadTimeline(1),
    ]);
    setPerfPage(1);
    setTimelinePage(1);
    setRefreshing(false);
  };

  const handleApplyFilters = () => {
    logger.info('ADMIN_STATS', '🔎 Accounting statistics filtered');
    loadStats();
    loadPerformanceTable(1);
    loadTimeline(1);
    setPerfPage(1);
    setTimelinePage(1);
  };

  const handleExport = async (reportType: string) => {
    logger.info('ADMIN_STATS', `📤 Exporting ${reportType} report`);
    setExporting(reportType);
    
    try {
      let blob: Blob;
      let filename: string;
      
      switch (reportType) {
        case 'daily-collection':
          blob = await financeService.exportStudentPayments(reportFilters);
          filename = `daily_collection_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'monthly-revenue':
          blob = await financeService.exportMonthlyCollections(reportFilters.start_date, reportFilters.end_date);
          filename = `monthly_revenue_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'admin-submissions':
          blob = await financeService.exportPrincipalPayouts();
          filename = `admin_cash_submissions_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        case 'accountant-collections':
          blob = await financeService.exportAccountantCollections(reportFilters);
          filename = `accountant_collections_${new Date().toISOString().split('T')[0]}.csv`;
          break;
        default:
          throw new Error('Unknown report type');
      }
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      logger.info('ADMIN_STATS', `✅ Report exported: ${filename}`);
    } catch (error: any) {
      logger.error('ADMIN_STATS', `❌ Export failed: ${error.message}`);
      alert('Failed to export report');
    } finally {
      setExporting(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getActivityTypeIcon = (type: string) => {
    switch (type) {
      case 'payment': return <DollarSign className="w-4 h-4 text-green-600" />;
      case 'admin_payout': return <Send className="w-4 h-4 text-blue-600" />;
      case 'session_open': return <Clock className="w-4 h-4 text-amber-600" />;
      case 'session_close': return <Clock className="w-4 h-4 text-red-600" />;
      default: return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">Accounting Statistics</h1>
          <p className="text-gray-600">Loading school-wide statistics...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-lg p-6 shadow animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartSkeleton />
          <ChartSkeleton />
        </div>
      </div>
    );
  }

  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
            <Building2 className="w-8 h-8 text-indigo-600" />
            Accounting Hub
          </h1>
          <p className="text-gray-600">
            {stats?.school_name} - Unified Accounting, Finance & Reporting Dashboard
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
            {stats?.active_sessions_count || 0} Active Sessions
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
            title="Force refresh all dashboard data from database"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-4 border-b border-gray-200">
        {[
          { id: 'overview', label: '📊 Accounting Overview', icon: BarChart3 },
          { id: 'finance', label: '💰 Financial Analytics', icon: DollarSign },
          { id: 'reports', label: '📋 Reports & Export', icon: FileText },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`pb-4 px-4 font-medium border-b-2 transition ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: ACCOUNTING OVERVIEW */}

      {/* Filters */}
      {activeTab === 'overview' && (
        <FiltersPanel 
          filters={filters} 
          onFilterChange={setFilters} 
          onApply={handleApplyFilters}
        />
      )}

      {/* ACCOUNTING OVERVIEW TAB */}
      {activeTab === 'overview' && (<>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total School Revenue */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <DollarSign className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Revenue</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats?.total_school_revenue || 0)}</p>
          <p className="text-sm opacity-90">School Revenue</p>
        </motion.div>

        {/* Admin Cash Submissions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <Send className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Payouts</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats?.total_admin_payouts || 0)}</p>
          <p className="text-sm opacity-90">Admin Cash Submissions</p>
        </motion.div>

        {/* Outstanding */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <TrendingUp className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Balance</span>
          </div>
          <p className="text-2xl font-bold">{formatCurrency(stats?.total_outstanding || 0)}</p>
          <p className="text-sm opacity-90">Outstanding</p>
        </motion.div>

        {/* Total Transactions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <Activity className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Count</span>
          </div>
          <p className="text-2xl font-bold">{stats?.total_transactions || 0}</p>
          <p className="text-sm opacity-90">Transactions</p>
        </motion.div>

        {/* Accountants */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-gradient-to-br from-rose-500 to-red-600 rounded-xl p-6 text-white shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <Users className="w-8 h-8 opacity-80" />
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Staff</span>
          </div>
          <p className="text-2xl font-bold">{stats?.accountants_summary?.length || 0}</p>
          <p className="text-sm opacity-90">Accountants</p>
        </motion.div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Accountant */}
        <LazyChart>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-800">Revenue by Accountant</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.revenue_by_accountant || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} angle={-45} textAnchor="end" height={80} />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} fontSize={12} />
                <Tooltip formatter={(value) => value !== undefined ? [formatCurrency(value as number), 'Revenue'] : ['', 'Revenue']} />
                <Legend />
                <Bar dataKey="value" fill="#00C49F" name="Revenue" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </LazyChart>

        {/* Monthly Revenue Trend */}
        <LazyChart>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-800">Monthly School Revenue</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats?.monthly_revenue_trend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} fontSize={12} />
                <Tooltip formatter={(value) => value !== undefined ? [formatCurrency(value as number), 'Revenue'] : ['', 'Revenue']} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#0088FE" 
                  strokeWidth={2}
                  dot={{ fill: '#0088FE', r: 4 }}
                  name="Revenue"
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </LazyChart>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method Usage */}
        <LazyChart>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <PieChartIcon className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-800">Payment Method Usage</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats?.payment_method_usage || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="total_amount"
                  nameKey="method_name"
                >
                  {(stats?.payment_method_usage || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => value !== undefined ? [formatCurrency(value as number), 'Amount'] : ['', 'Amount']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </LazyChart>

        {/* Sessions by Accountant */}
        <LazyChart>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-sm p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-gray-800">Sessions Opened per Accountant</h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats?.sessions_by_accountant || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={11} angle={-45} textAnchor="end" height={80} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#FFBB28" name="Sessions" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </LazyChart>
      </div>

      {/* Accountant Performance Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Accountant Performance
          </h3>
          {perfLoading && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Accountant
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Collected
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transactions
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sessions
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Outstanding
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Daily
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(perfData?.data || []).map((row) => (
                <tr key={row.accountant_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{row.accountant_name}</div>
                      <div className="text-xs text-gray-500">{row.accountant_email}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-green-600">
                    {formatCurrency(row.total_collected)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                    {row.transaction_count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                    {row.sessions_opened}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-amber-600 font-medium">
                    {formatCurrency(row.outstanding_balance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                    {formatCurrency(row.avg_daily_collection)}
                  </td>
                </tr>
              ))}
              {(!perfData?.data || perfData?.data.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No accountant data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {(perfData?.total_pages ?? 0) > 1 && (
          <Pagination
            page={perfPage}
            totalPages={perfData?.total_pages ?? 1}
            onPageChange={setPerfPage}
          />
        )}
      </motion.div>

      {/* Activity Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Activity Timeline
          </h3>
          {timelineLoading && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <div className="divide-y divide-gray-100">
          {(timeline?.data || []).map((item) => (
            <div key={item.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50">
              <div className="flex-shrink-0">
                {getActivityTypeIcon(item.activity_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.description}
                </p>
                <p className="text-xs text-gray-500">
                  {item.actor_name} • {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
              {item.amount !== null && (
                <div className="text-sm font-semibold text-green-600">
                  {formatCurrency(item.amount)}
                </div>
              )}
            </div>
          ))}
          {(!timeline?.data || timeline?.data.length === 0) && (
            <div className="px-6 py-8 text-center text-gray-500">
              No recent activity
            </div>
          )}
        </div>
        </motion.div>
        {(timeline?.total_pages ?? 0) > 1 && (
          <Pagination
            page={timelinePage}
            totalPages={timeline?.total_pages ?? 1}
            onPageChange={setTimelinePage}
          />
      )}
      </>) }

      {/* FINANCE ANALYTICS TAB */}
      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Finance Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Total Collected Today */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <DollarSign className="w-8 h-8 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Today</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(financeSummary?.total_collected_today || 0)}</p>
              <p className="text-sm opacity-90">Collected Today</p>
            </motion.div>

            {/* Total Collected This Month */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <Calendar className="w-8 h-8 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Month</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(financeSummary?.total_collected_month || 0)}</p>
              <p className="text-sm opacity-90">This Month</p>
            </motion.div>

            {/* Outstanding Fees */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <AlertCircle className="w-8 h-8 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Pending</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(financeSummary?.outstanding_fees || 0)}</p>
              <p className="text-sm opacity-90">Outstanding</p>
            </motion.div>

            {/* Admin Cash Submissions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <Send className="w-8 h-8 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Total</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(financeSummary?.principal_payouts_total || 0)}</p>
              <p className="text-sm opacity-90">To Admin</p>
            </motion.div>

            {/* Active Sessions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between mb-3">
                <Users className="w-8 h-8 opacity-80" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">Active</span>
              </div>
              <p className="text-2xl font-bold">{financeSummary?.active_sessions || 0}</p>
              <p className="text-sm opacity-90">Open Sessions</p>
            </motion.div>
          </div>

          {/* Finance Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Collection Trend */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white rounded-xl p-6 shadow-lg"
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Monthly Collection Trend
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value as number)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Collection"
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-2 text-center">
                Total: {formatCurrency(monthlyData?.total || 0)}
              </p>
            </motion.div>

            {/* Class Revenue */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-xl p-6 shadow-lg"
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-green-600" />
                Class-wise Revenue
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={classRevenue?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="class_name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value as number)}
                  />
                  <Legend />
                  <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-2 text-center">
                Total: {formatCurrency(classRevenue?.total || 0)}
              </p>
            </motion.div>
          </div>

          {/* Finance Charts Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Accountant Performance */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-white rounded-xl p-6 shadow-lg"
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                Accountant Performance
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={accountantPerf?.data || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="accountant_name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value as number)}
                  />
                  <Legend />
                  <Bar dataKey="total_collected" fill="#8b5cf6" name="Collected" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-sm text-gray-500 mt-2 text-center">
                Total: {formatCurrency(accountantPerf?.total_collected || 0)}
              </p>
            </motion.div>

            {/* Outstanding Fees Distribution */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-white rounded-xl p-6 shadow-lg"
            >
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600" />
                Outstanding Fees Distribution
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={outstandingDist}
                    dataKey="total_amount"
                    nameKey="range_label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {outstandingDist.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => formatCurrency(value as number)}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </div>
      )}

      {/* REPORTS & EXPORT TAB */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Report Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Filter className="w-5 h-5 text-blue-600" />
              Report Filters
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={reportFilters.start_date || ''}
                  onChange={(e) => setReportFilters({...reportFilters, start_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={reportFilters.end_date || ''}
                  onChange={(e) => setReportFilters({...reportFilters, end_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </motion.div>

          {/* Export Options */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl p-6 shadow-lg"
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Download className="w-5 h-5 text-green-600" />
              Export Reports
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => handleExport('daily-collection')}
                disabled={exporting === 'daily-collection'}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting === 'daily-collection' ? 'Exporting...' : 'Daily Collection Report'}
              </button>
              <button
                onClick={() => handleExport('monthly-revenue')}
                disabled={exporting === 'monthly-revenue'}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting === 'monthly-revenue' ? 'Exporting...' : 'Monthly Revenue Report'}
              </button>
              <button
                onClick={() => handleExport('admin-submissions')}
                disabled={exporting === 'admin-submissions'}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting === 'admin-submissions' ? 'Exporting...' : 'Admin Submissions Report'}
              </button>
              <button
                onClick={() => handleExport('accountant-collections')}
                disabled={exporting === 'accountant-collections'}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {exporting === 'accountant-collections' ? 'Exporting...' : 'Accountant Collections'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );

}

export default AdminAccountingStatsPage;

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, LogOut, RefreshCw, Download, Eye, FileText, 
  DollarSign, Database, TrendingUp,
  CheckCircle, AlertTriangle, Filter,
  Loader2, PieChart, BarChart3, X,
  Settings, Plus
} from 'lucide-react';
import { 
  BillingConfig, BillingConfigCreate, BillingAnalytics, 
  Invoice, InvoiceStatus, SaaSSchool 
} from '../types';
import { billingService } from '../services/billing';
import { saasService } from '../services/saas';
import { authService } from '../services/auth';
import logger from '../utils/logger';

// ================= Helper Functions =================
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// ================= Components =================

// Loading Spinner
const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; text?: string }> = ({ 
  size = 'md', 
  text 
}) => {
  const sizeClasses = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' };
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-500`} />
      {text && <p className="text-slate-400 text-sm">{text}</p>}
    </div>
  );
};

// Stats Card
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}> = ({ title, value, icon, color, subtitle }) => (
  <div className={`bg-gradient-to-br ${color} rounded-xl p-5 shadow-lg`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white/80">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {subtitle && <p className="text-xs text-white/60 mt-1">{subtitle}</p>}
      </div>
      <div className="p-3 bg-white/20 rounded-lg">{icon}</div>
    </div>
  </div>
);

// Invoice Status Badge
const InvoiceStatusBadge: React.FC<{ status: InvoiceStatus }> = ({ status }) => {
  const styles: Record<InvoiceStatus, string> = {
    draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
    cancelled: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Simple Pie Chart Component
const SimplePieChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <div className="text-slate-400 text-center py-8">No data</div>;
  
  let cumulativeAngle = 0;
  
  return (
    <div className="flex items-center gap-6">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          {data.map((item, idx) => {
            const angle = (item.value / total) * 360;
            const startAngle = cumulativeAngle;
            cumulativeAngle += angle;
            
            const x1 = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
            const y1 = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
            const x2 = 50 + 40 * Math.cos(((startAngle + angle) * Math.PI) / 180);
            const y2 = 50 + 40 * Math.sin(((startAngle + angle) * Math.PI) / 180);
            
            const largeArc = angle > 180 ? 1 : 0;
            
            return (
              <path
                key={idx}
                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={item.color}
                className="opacity-80 hover:opacity-100 transition-opacity"
              />
            );
          })}
        </svg>
      </div>
      <div className="space-y-2">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-sm text-slate-300">{item.label}</span>
            <span className="text-sm text-slate-500">({Math.round((item.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple Bar Chart
const SimpleBarChart: React.FC<{ data: { label: string; value: number; color?: string }[]; max?: number }> = ({ data, max }) => {
  const maxVal = max || Math.max(...data.map(d => d.value), 1);
  
  return (
    <div className="space-y-3">
      {data.map((item, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-300">{item.label}</span>
            <span className="text-slate-400">{formatBytes(item.value)}</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / maxVal) * 100}%`,
                backgroundColor: item.color || '#3B82F6',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// Invoice Preview Modal
const InvoicePreviewModal: React.FC<{
  invoice: Invoice;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}> = ({ invoice, onClose, onDownload, downloading }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/70" onClick={onClose} />
    <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-slate-400 hover:text-white"
      >
        <X className="w-5 h-5" />
      </button>
      
      <div className="border-b border-slate-700 pb-4 mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          Invoice Preview
        </h2>
        <p className="text-slate-400 text-sm mt-1">#{invoice.invoice_number}</p>
      </div>
      
      {/* Invoice Header */}
      <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-500 uppercase">Bill To</p>
            <p className="text-lg font-semibold text-white">{invoice.school_name}</p>
            <p className="text-sm text-slate-400">Database: {invoice.database_name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase">Status</p>
            <InvoiceStatusBadge status={invoice.status} />
            <p className="text-sm text-slate-400 mt-2">
              Due: {invoice.due_date ? formatDate(invoice.due_date) : 'N/A'}
            </p>
          </div>
        </div>
      </div>
      
      {/* Billing Period */}
      <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
        <p className="text-xs text-slate-500 uppercase mb-2">Billing Period</p>
        <p className="text-white">
          {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
        </p>
      </div>
      
      {/* Usage Stats */}
      <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
        <p className="text-xs text-slate-500 uppercase mb-3">Usage Statistics</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-slate-400 text-sm">Storage Used</p>
            <p className="text-white font-semibold">{formatBytes(invoice.storage_bytes)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Storage Share</p>
            <p className="text-white font-semibold">{invoice.storage_percentage.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Students</p>
            <p className="text-white font-semibold">{invoice.student_count.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Teachers</p>
            <p className="text-white font-semibold">{invoice.teacher_count.toLocaleString()}</p>
          </div>
        </div>
      </div>
      
      {/* Cost Breakdown */}
      <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
        <p className="text-xs text-slate-500 uppercase mb-3">Cost Breakdown</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Fixed Infrastructure (CPU/RAM)</span>
            <span className="text-white">{formatCurrency(invoice.cost_breakdown.fixed_cost)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Storage-Based Cost</span>
            <span className="text-white">{formatCurrency(invoice.cost_breakdown.storage_cost)}</span>
          </div>
          <div className="border-t border-slate-700 pt-2 flex justify-between text-sm">
            <span className="text-slate-300">Base Subtotal</span>
            <span className="text-white">{formatCurrency(invoice.cost_breakdown.base_total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Service Markup</span>
            <span className="text-white">{formatCurrency(invoice.cost_breakdown.markup_amount)}</span>
          </div>
          {invoice.cost_breakdown.misc_charges > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">
                Misc Charges {invoice.cost_breakdown.misc_charges_description ? 
                  `(${invoice.cost_breakdown.misc_charges_description})` : ''}
              </span>
              <span className="text-white">{formatCurrency(invoice.cost_breakdown.misc_charges)}</span>
            </div>
          )}
          {invoice.cost_breakdown.discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Discount</span>
              <span className="text-emerald-400">-{formatCurrency(invoice.cost_breakdown.discount)}</span>
            </div>
          )}
          <div className="border-t border-slate-700 pt-2 flex justify-between">
            <span className="text-white font-semibold">Total Due</span>
            <span className="text-blue-400 font-bold text-lg">
              {formatCurrency(invoice.cost_breakdown.total)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
        >
          Close
        </button>
        <button
          onClick={onDownload}
          disabled={downloading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                     transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Download PDF
        </button>
      </div>
    </div>
  </div>
);

// Billing Config Modal
const BillingConfigModal: React.FC<{
  isOpen: boolean;
  config: BillingConfig | null;
  onClose: () => void;
  onSave: (config: BillingConfigCreate) => Promise<void>;
  saving: boolean;
}> = ({ isOpen, config, onClose, onSave, saving }) => {
  const [formData, setFormData] = useState<BillingConfigCreate>({
    total_mongo_cost: 0,
    billing_period: 'monthly',
    period_start: new Date().toISOString().split('T')[0],
    period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    fixed_cpu_ram_cost: 0,
    dynamic_storage_cost: 0,
    markup_percentage: 20,
    global_misc_amount: 0,
    global_misc_description: '',
  });
  
  useEffect(() => {
    if (config) {
      setFormData({
        total_mongo_cost: config.total_mongo_cost,
        billing_period: config.billing_period,
        period_start: config.period_start.split('T')[0],
        period_end: config.period_end.split('T')[0],
        fixed_cpu_ram_cost: config.fixed_cpu_ram_cost,
        dynamic_storage_cost: config.dynamic_storage_cost,
        markup_percentage: config.markup_percentage,
        global_misc_amount: config.global_misc_amount || 0,
        global_misc_description: config.global_misc_description || '',
      });
    }
  }, [config]);
  
  // Auto-calculate split when total changes
  useEffect(() => {
    if (formData.total_mongo_cost > 0) {
      // Default 30% fixed, 70% storage (you can adjust this ratio)
      const fixed = formData.total_mongo_cost * 0.3;
      const storage = formData.total_mongo_cost * 0.7;
      setFormData(prev => ({
        ...prev,
        fixed_cpu_ram_cost: Math.round(fixed * 100) / 100,
        dynamic_storage_cost: Math.round(storage * 100) / 100,
      }));
    }
  }, [formData.total_mongo_cost]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-slate-800 rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-500" />
          Billing Configuration
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* MongoDB Cost Input */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Total MongoDB Cost ($)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Enter your MongoDB Atlas bill amount. For free tier, enter 0.
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.total_mongo_cost}
              onChange={(e) => setFormData({ ...formData, total_mongo_cost: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
          
          {/* Billing Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Period Start</label>
              <input
                type="date"
                value={formData.period_start}
                onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Period End</label>
              <input
                type="date"
                value={formData.period_end}
                onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                           focus:border-blue-500 outline-none"
              />
            </div>
          </div>
          
          {/* Cost Split (Auto-calculated) */}
          <div className="bg-slate-900/50 rounded-lg p-3">
            <p className="text-xs text-slate-500 uppercase mb-2">Cost Allocation (Auto-Calculated)</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-400">Fixed (30%)</span>
                <p className="text-white">{formatCurrency(formData.fixed_cpu_ram_cost)}</p>
              </div>
              <div>
                <span className="text-slate-400">Storage (70%)</span>
                <p className="text-white">{formatCurrency(formData.dynamic_storage_cost)}</p>
              </div>
            </div>
          </div>
          
          {/* Markup */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Service Markup (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={formData.markup_percentage}
              onChange={(e) => setFormData({ ...formData, markup_percentage: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 outline-none"
            />
          </div>
          
          {/* Global Misc Amount */}
          <div className="border-t border-slate-700 pt-4">
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Global Miscellaneous Amount ($)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Extra amount applied equally to ALL schools (e.g., support fee)
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.global_misc_amount}
              onChange={(e) => setFormData({ ...formData, global_misc_amount: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 outline-none"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Misc Description (Optional)
            </label>
            <input
              type="text"
              value={formData.global_misc_description}
              onChange={(e) => setFormData({ ...formData, global_misc_description: e.target.value })}
              placeholder="e.g., Platform maintenance fee"
              className="w-full px-3 py-2 bg-slate-700 text-white rounded-lg border border-slate-600 
                         focus:border-blue-500 outline-none"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                         disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save Config
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================= Main Component =================
const BillingDashboard: React.FC = () => {
  // State
  const [analytics, setAnalytics] = useState<BillingAnalytics | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [schools, setSchools] = useState<SaaSSchool[]>([]);
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [loading, setLoading] = useState({ analytics: true, invoices: true, schools: true });
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [generatingInvoices, setGeneratingInvoices] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [savingConfig, setSavingConfig] = useState(false);
  
  // Load data
  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, analytics: true }));
      const data = await billingService.getBillingAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      logger.error('BILLING', `Error loading analytics: ${err.message}`);
      // Don't show error - analytics might not be available yet
    } finally {
      setLoading(prev => ({ ...prev, analytics: false }));
    }
  }, []);
  
  const loadInvoices = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, invoices: true }));
      const params = statusFilter !== 'all' ? { status: statusFilter } : undefined;
      const data = await billingService.getInvoices(params);
      setInvoices(data);
    } catch (err: any) {
      logger.error('BILLING', `Error loading invoices: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, invoices: false }));
    }
  }, [statusFilter]);
  
  const loadSchools = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, schools: true }));
      const result = await saasService.getSchools({ status: 'active' });
      setSchools(result.items);
    } catch (err: any) {
      logger.error('BILLING', `Error loading schools: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, schools: false }));
    }
  }, []);
  
  const loadConfig = useCallback(async () => {
    try {
      const data = await billingService.getBillingConfig();
      setConfig(data);
    } catch (err: any) {
      logger.error('BILLING', `Error loading config: ${err.message}`);
    }
  }, []);
  
  useEffect(() => {
    loadAnalytics();
    loadInvoices();
    loadSchools();
    loadConfig();
  }, [loadAnalytics, loadInvoices, loadSchools, loadConfig]);
  
  // Handlers
  const handleLogout = () => {
    authService.logout();
    window.location.href = '#/login';
  };
  
  const handleBackToDashboard = () => {
    window.location.href = '#/root-admin';
  };
  
  const handleDownloadInvoicePDF = async (invoiceId: string, invoiceNumber: string) => {
    try {
      setDownloading(true);
      await billingService.downloadInvoicePDF(invoiceId, invoiceNumber);
    } catch (err: any) {
      setError(`Failed to download PDF: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };
  
  const handleGenerateBulkInvoices = async () => {
    if (!config) {
      setError('Please configure billing settings first');
      return;
    }
    
    try {
      setGeneratingInvoices(true);
      const result = await billingService.generateBulkInvoices({
        billing_period: config.billing_period,
        period_start: config.period_start,
        period_end: config.period_end,
      });
      logger.info('BILLING', `Generated ${result.length} invoices`);
      await loadInvoices();
    } catch (err: any) {
      setError(`Failed to generate invoices: ${err.message}`);
    } finally {
      setGeneratingInvoices(false);
    }
  };
  
  const handleSaveConfig = async (configData: BillingConfigCreate) => {
    try {
      setSavingConfig(true);
      if (config?.id) {
        await billingService.updateBillingConfig(config.id, configData);
      } else {
        await billingService.createBillingConfig(configData);
      }
      await loadConfig();
      setConfigModalOpen(false);
    } catch (err: any) {
      setError(`Failed to save config: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };
  
  const handleDownloadReport = async () => {
    try {
      setDownloading(true);
      await billingService.downloadBillingReportPDF();
    } catch (err: any) {
      setError(`Failed to download report: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };
  
  // Prepare chart data
  const invoiceStatusData = [
    { label: 'Paid', value: analytics?.paid_invoices || 0, color: '#10B981' },
    { label: 'Pending', value: analytics?.pending_invoices || 0, color: '#F59E0B' },
    { label: 'Overdue', value: analytics?.overdue_invoices || 0, color: '#EF4444' },
    { label: 'Draft', value: analytics?.draft_invoices || 0, color: '#6B7280' },
  ].filter(d => d.value > 0);
  
  const storageDistribution = (analytics?.storage?.top_schools || []).slice(0, 5).map((s, idx) => ({
    label: s.school_name,
    value: s.storage_bytes,
    color: ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'][idx],
  }));
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToDashboard}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <DollarSign className="w-6 h-6 text-emerald-500" />
                Billing & Analytics
              </h1>
              <p className="text-sm text-slate-400">Manage billing, invoices, and revenue analytics</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                loadAnalytics();
                loadInvoices();
                loadSchools();
              }}
              className="px-3 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                         transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 
                         rounded-lg hover:bg-red-600/30 transition flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {loading.analytics ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-slate-800/50 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-slate-700 rounded w-1/2 mb-2" />
                <div className="h-8 bg-slate-700 rounded w-3/4" />
              </div>
            ))
          ) : (
            <>
              <StatsCard
                title="Total Revenue"
                value={formatCurrency(analytics?.revenue?.total_predicted_revenue || 0)}
                subtitle="Predicted this period"
                icon={<DollarSign className="w-6 h-6 text-white" />}
                color="from-emerald-600 to-emerald-800"
              />
              <StatsCard
                title="MongoDB Cost"
                value={formatCurrency(analytics?.revenue?.total_mongo_cost || 0)}
                subtitle="Your database expenses"
                icon={<Database className="w-6 h-6 text-white" />}
                color="from-blue-600 to-blue-800"
              />
              <StatsCard
                title="Profit"
                value={formatCurrency(analytics?.revenue?.total_profit || 0)}
                subtitle={`${analytics?.revenue?.profit_margin_percentage?.toFixed(1) || 0}% margin`}
                icon={<TrendingUp className="w-6 h-6 text-white" />}
                color="from-purple-600 to-purple-800"
              />
              <StatsCard
                title="Total Invoices"
                value={analytics?.total_invoices || 0}
                subtitle={`${analytics?.paid_invoices || 0} paid`}
                icon={<FileText className="w-6 h-6 text-white" />}
                color="from-amber-600 to-amber-800"
              />
            </>
          )}
        </div>
        
        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Invoice Status Distribution */}
          <div className="bg-slate-800/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-500" />
              Invoice Status Distribution
            </h3>
            {loading.analytics ? (
              <LoadingSpinner text="Loading..." />
            ) : invoiceStatusData.length > 0 ? (
              <SimplePieChart data={invoiceStatusData} />
            ) : (
              <p className="text-slate-400 text-center py-8">No invoices yet</p>
            )}
          </div>
          
          {/* Storage Distribution */}
          <div className="bg-slate-800/50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
              Top Schools by Storage
            </h3>
            {loading.analytics ? (
              <LoadingSpinner text="Loading..." />
            ) : storageDistribution.length > 0 ? (
              <SimpleBarChart data={storageDistribution} />
            ) : (
              <p className="text-slate-400 text-center py-8">No storage data</p>
            )}
          </div>
        </div>
        
        {/* Actions Row */}
        <div className="bg-slate-800/50 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setConfigModalOpen(true)}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                         transition flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Billing Config
            </button>
            <button
              onClick={handleGenerateBulkInvoices}
              disabled={generatingInvoices || !config}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                         disabled:opacity-50 transition flex items-center gap-2"
            >
              {generatingInvoices ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Generate All Invoices
            </button>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadReport}
              disabled={downloading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 
                         disabled:opacity-50 transition flex items-center gap-2"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Download Report
            </button>
          </div>
        </div>
        
        {/* Current Config Summary */}
        {config && (
          <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
                Current Billing Period
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Period</p>
                <p className="text-white">{formatDate(config.period_start)} - {formatDate(config.period_end)}</p>
              </div>
              <div>
                <p className="text-slate-500">MongoDB Cost</p>
                <p className="text-white">{formatCurrency(config.total_mongo_cost)}</p>
              </div>
              <div>
                <p className="text-slate-500">Markup</p>
                <p className="text-white">{config.markup_percentage}%</p>
              </div>
              <div>
                <p className="text-slate-500">Misc Fee</p>
                <p className="text-white">
                  {config.global_misc_amount ? formatCurrency(config.global_misc_amount) : 'None'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Active Schools</p>
                <p className="text-white">{schools.length}</p>
              </div>
            </div>
          </div>
        )}
        
        {/* Invoices Table */}
        <div className="bg-slate-800/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" />
              Invoices
            </h3>
            
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | 'all')}
                className="px-3 py-1.5 bg-slate-700 text-white rounded-lg border border-slate-600 
                           text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>
          
          {loading.invoices ? (
            <div className="p-8">
              <LoadingSpinner size="lg" text="Loading invoices..." />
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No invoices found</p>
              <p className="text-slate-500 text-sm mt-1">
                Configure billing and generate invoices to get started
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Invoice #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">School</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Storage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-slate-700/30 transition">
                      <td className="px-4 py-3 text-sm font-mono text-white">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-white">{invoice.school_name}</p>
                        <p className="text-xs text-slate-500">{invoice.database_name}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {formatDate(invoice.period_start)} - {formatDate(invoice.period_end)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm text-white">{formatBytes(invoice.storage_bytes)}</p>
                        <p className="text-xs text-slate-500">{invoice.storage_percentage.toFixed(1)}%</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-400">
                        {formatCurrency(invoice.cost_breakdown.total)}
                      </td>
                      <td className="px-4 py-3">
                        <InvoiceStatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setPreviewInvoice(invoice)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadInvoicePDF(invoice.id, invoice.invoice_number)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      
      {/* Modals */}
      <BillingConfigModal
        isOpen={configModalOpen}
        config={config}
        onClose={() => setConfigModalOpen(false)}
        onSave={handleSaveConfig}
        saving={savingConfig}
      />
      
      {previewInvoice && (
        <InvoicePreviewModal
          invoice={previewInvoice}
          onClose={() => setPreviewInvoice(null)}
          onDownload={() => handleDownloadInvoicePDF(previewInvoice.id, previewInvoice.invoice_number)}
          downloading={downloading}
        />
      )}
    </div>
  );
};

export default BillingDashboard;

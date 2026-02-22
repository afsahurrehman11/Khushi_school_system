/**
 * Billing & Invoice API Service
 * Handles billing configuration, invoice management, and analytics (Root only)
 */

import {
  BillingConfig,
  BillingConfigCreate,
  Invoice,
  InvoiceCreate,
  InvoiceUpdate,
  InvoiceStatus,
  BillingPeriod,
  BulkInvoiceGenerate,
  BillingAnalytics,
  RevenueAnalytics,
  StorageAnalytics,
  BillingChangeLog,
  SchoolBillingHistoryItem,
} from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class BillingService {
  private endpoint = `${API_BASE_URL}/billing`;

  // ================= Billing Configuration =================

  /**
   * Get current billing configuration
   */
  async getBillingConfig(): Promise<BillingConfig | null> {
    try {
      logger.info('BILLING', 'Fetching billing configuration');

      const response = await fetch(`${this.endpoint}/billing/config`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch billing config: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('BILLING', 'Billing config fetched');
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error fetching billing config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create new billing configuration
   */
  async createBillingConfig(config: BillingConfigCreate): Promise<BillingConfig> {
    try {
      logger.info('BILLING', `Creating billing config: $${config.total_mongo_cost}`);

      const response = await fetch(`${this.endpoint}/billing/config`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create billing config');
      }

      const data = await response.json();
      logger.info('BILLING', 'Billing config created');
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error creating billing config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update billing configuration
   */
  async updateBillingConfig(configId: string, updates: Partial<BillingConfigCreate>): Promise<BillingConfig> {
    try {
      logger.info('BILLING', `Updating billing config: ${configId}`);

      const response = await fetch(`${this.endpoint}/billing/config/${configId}`, {
        method: 'PATCH',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update billing config');
      }

      const data = await response.json();
      logger.info('BILLING', 'Billing config updated');
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error updating billing config: ${error.message}`);
      throw error;
    }
  }

  // ================= Invoice Management =================

  /**
   * Get all invoices with optional filters
   */
  async getInvoices(params?: {
    status?: InvoiceStatus;
    billing_period?: BillingPeriod;
    school_id?: string;
    skip?: number;
    limit?: number;
  }): Promise<Invoice[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.status) queryParams.append('status', params.status);
      if (params?.billing_period) queryParams.append('billing_period', params.billing_period);
      if (params?.school_id) queryParams.append('school_id', params.school_id);
      if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());

      const url = `${this.endpoint}/billing/invoices?${queryParams.toString()}`;
      logger.info('BILLING', 'Fetching invoices');

      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch invoices: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('BILLING', `Fetched ${data.length} invoices`);
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error fetching invoices: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get single invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<Invoice> {
    try {
      logger.info('BILLING', `Fetching invoice: ${invoiceId}`);

      const response = await fetch(`${this.endpoint}/billing/invoices/${invoiceId}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch invoice: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error fetching invoice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create invoice for a single school
   */
  async createInvoice(invoiceData: InvoiceCreate): Promise<Invoice> {
    try {
      logger.info('BILLING', `Creating invoice for school: ${invoiceData.school_id}`);

      const response = await fetch(`${this.endpoint}/billing/invoices`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(invoiceData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create invoice');
      }

      const data = await response.json();
      logger.info('BILLING', `Invoice created: ${data.invoice_number}`);
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error creating invoice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate invoices for all active schools
   */
  async generateBulkInvoices(bulkData: BulkInvoiceGenerate): Promise<Invoice[]> {
    try {
      logger.info('BILLING', 'Generating bulk invoices');

      const response = await fetch(`${this.endpoint}/billing/invoices/bulk`, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(bulkData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate bulk invoices');
      }

      const data = await response.json();
      logger.info('BILLING', `Generated ${data.length} invoices`);
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error generating bulk invoices: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update invoice (for manual adjustments)
   */
  async updateInvoice(invoiceId: string, updates: InvoiceUpdate): Promise<Invoice> {
    try {
      logger.info('BILLING', `Updating invoice: ${invoiceId}`);

      const response = await fetch(`${this.endpoint}/billing/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update invoice');
      }

      const data = await response.json();
      logger.info('BILLING', 'Invoice updated');
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error updating invoice: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a draft invoice
   */
  async deleteInvoice(invoiceId: string): Promise<void> {
    try {
      logger.info('BILLING', `Deleting invoice: ${invoiceId}`);

      const response = await fetch(`${this.endpoint}/billing/invoices/${invoiceId}`, {
        method: 'DELETE',
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete invoice');
      }

      logger.info('BILLING', 'Invoice deleted');
    } catch (error: any) {
      logger.error('BILLING', `Error deleting invoice: ${error.message}`);
      throw error;
    }
  }

  // ================= PDF Downloads =================

  /**
   * Download invoice as PDF
   */
  async downloadInvoicePDF(invoiceId: string, invoiceNumber: string): Promise<void> {
    try {
      logger.info('BILLING', `Downloading PDF for invoice: ${invoiceNumber}`);

      const response = await fetch(`${this.endpoint}/billing/invoices/${invoiceId}/pdf`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to download PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${invoiceNumber.replace(/-/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      logger.info('BILLING', 'PDF downloaded');
    } catch (error: any) {
      logger.error('BILLING', `Error downloading PDF: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download billing analytics report as PDF
   */
  async downloadBillingReportPDF(): Promise<void> {
    try {
      logger.info('BILLING', 'Downloading billing report PDF');

      const response = await fetch(`${this.endpoint}/billing/reports/pdf`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to download report PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Billing_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      logger.info('BILLING', 'Report PDF downloaded');
    } catch (error: any) {
      logger.error('BILLING', `Error downloading report PDF: ${error.message}`);
      throw error;
    }
  }

  // ================= Analytics =================

  /**
   * Get comprehensive billing analytics
   */
  async getBillingAnalytics(): Promise<BillingAnalytics> {
    try {
      logger.info('BILLING', 'Fetching billing analytics');

      const response = await fetch(`${this.endpoint}/billing/analytics`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('BILLING', 'Analytics fetched');
      return data;
    } catch (error: any) {
      logger.error('BILLING', `Error fetching analytics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get revenue analytics
   */
  async getRevenueAnalytics(): Promise<RevenueAnalytics> {
    try {
      const response = await fetch(`${this.endpoint}/billing/analytics/revenue`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch revenue analytics: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error('BILLING', `Error fetching revenue analytics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get storage analytics
   */
  async getStorageAnalytics(topN: number = 5): Promise<StorageAnalytics> {
    try {
      const response = await fetch(`${this.endpoint}/billing/analytics/storage?top_n=${topN}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch storage analytics: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error('BILLING', `Error fetching storage analytics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get billing history for a school
   */
  async getSchoolBillingHistory(schoolId: string, months: number = 12): Promise<SchoolBillingHistoryItem[]> {
    try {
      logger.info('BILLING', `Fetching billing history for school: ${schoolId}`);

      const response = await fetch(
        `${this.endpoint}/billing/analytics/school/${schoolId}/history?months=${months}`,
        { headers: authService.getAuthHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch school billing history: ${response.statusText}`);
      }

      const data = await response.json();
      return data.history || [];
    } catch (error: any) {
      logger.error('BILLING', `Error fetching school billing history: ${error.message}`);
      throw error;
    }
  }

  // ================= Audit Logs =================

  /**
   * Get billing change logs
   */
  async getBillingLogs(params?: {
    entity_type?: string;
    entity_id?: string;
    limit?: number;
  }): Promise<BillingChangeLog[]> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.entity_type) queryParams.append('entity_type', params.entity_type);
      if (params?.entity_id) queryParams.append('entity_id', params.entity_id);
      if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());

      const response = await fetch(`${this.endpoint}/billing/logs?${queryParams.toString()}`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch billing logs: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error('BILLING', `Error fetching billing logs: ${error.message}`);
      throw error;
    }
  }

  // ================= Export =================

  /**
   * Export invoices as CSV
   */
  async exportInvoicesCSV(status?: InvoiceStatus): Promise<void> {
    try {
      logger.info('BILLING', 'Exporting invoices to CSV');

      const url = status
        ? `${this.endpoint}/billing/export/invoices?status=${status}`
        : `${this.endpoint}/billing/export/invoices`;

      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to export invoices');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `invoices_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      logger.info('BILLING', 'CSV exported');
    } catch (error: any) {
      logger.error('BILLING', `Error exporting CSV: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export analytics as JSON
   */
  async exportAnalyticsJSON(): Promise<BillingAnalytics> {
    try {
      const response = await fetch(`${this.endpoint}/billing/export/analytics`, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to export analytics');
      }

      return await response.json();
    } catch (error: any) {
      logger.error('BILLING', `Error exporting analytics: ${error.message}`);
      throw error;
    }
  }
}

export const billingService = new BillingService();
export default billingService;

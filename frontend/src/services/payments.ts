/**
 * Payments API Service
 * Handles payment tracking and fee payments
 */

import { Payment, FeePayment, PaginatedResponse } from '../types';
import { authService } from './auth';
import logger from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class PaymentsService {
  private paymentsEndpoint = `${API_BASE_URL}/payments`;
  private feePaymentsEndpoint = `${API_BASE_URL}/fee-payments`;

  // ========== Fee Payments ==========

  /**
   * Get all fee payments
   */
  async getFeePayments(
    studentId?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResponse<FeePayment>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('PAYMENTS', `Fetching fee payments (page ${page}) for school ${schoolId}`);
      
      let url = `${this.feePaymentsEndpoint}?page=${page}&page_size=${pageSize}`;
      if (studentId) {
        url += `&student_id=${studentId}`;
      }
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fee payments: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('PAYMENTS', `Fetched ${data.items?.length || 0} fee payments for school ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('PAYMENTS', `Error fetching fee payments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record fee payment
   */
  async recordFeePayment(payment: Partial<FeePayment>): Promise<FeePayment> {
    try {
      const schoolId = authService.getSchoolId();
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('PAYMENTS', `Recording fee payment ${payment.amount} by ${adminEmail} in ${schoolId}`);
      
      const response = await fetch(this.feePaymentsEndpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(payment),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to record fee payment');
      }

      const data = await response.json();
      logger.info('PAYMENTS', `Fee payment recorded: ${data.amount}`);
      return data;
    } catch (error: any) {
      logger.error('PAYMENTS', `Error recording fee payment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update fee payment
   */
  async updateFeePayment(id: string, updates: Partial<FeePayment>): Promise<FeePayment> {
    try {
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('PAYMENTS', `Updating fee payment ${id} by ${adminEmail}`);
      
      const response = await fetch(`${this.feePaymentsEndpoint}/${id}`, {
        method: 'PUT',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update fee payment');
      }

      const data = await response.json();
      logger.info('PAYMENTS', `Fee payment updated`);
      return data;
    } catch (error: any) {
      logger.error('PAYMENTS', `Error updating fee payment: ${error.message}`);
      throw error;
    }
  }

  // ========== Payments (General) ==========

  /**
   * Get all payments
   */
  async getPayments(
    studentId?: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<PaginatedResponse<Payment>> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('PAYMENTS', `Fetching payments (page ${page}) for school ${schoolId}`);
      
      let url = `${this.paymentsEndpoint}?page=${page}&page_size=${pageSize}`;
      if (studentId) {
        url += `&student_id=${studentId}`;
      }
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch payments: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('PAYMENTS', `Fetched ${data.items?.length || 0} payments for school ${schoolId}`);
      return data;
    } catch (error: any) {
      logger.error('PAYMENTS', `Error fetching payments: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create payment
   */
  async createPayment(payment: Partial<Payment>): Promise<Payment> {
    try {
      const adminEmail = authService.getUser()?.email || 'unknown';
      logger.info('PAYMENTS', `Creating payment ${payment.amount} by ${adminEmail}`);
      
      const response = await fetch(this.paymentsEndpoint, {
        method: 'POST',
        headers: authService.getAuthHeaders(),
        body: JSON.stringify(payment),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create payment');
      }

      const data = await response.json();
      logger.info('PAYMENTS', `Payment created: ${data.amount}`);
      return data;
    } catch (error: any) {
      logger.error('PAYMENTS', `Error creating payment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment analytics
   */
  async getPaymentAnalytics(startDate?: string, endDate?: string): Promise<any> {
    try {
      const schoolId = authService.getSchoolId();
      logger.info('PAYMENTS', `Fetching payment analytics for school ${schoolId}`);
      
      let url = `${API_BASE_URL}/reports/payment-analytics`;
      if (startDate && endDate) {
        url += `?start_date=${startDate}&end_date=${endDate}`;
      }
      
      const response = await fetch(url, {
        headers: authService.getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('PAYMENTS', `Analytics loaded`);
      return data;
    } catch (error: any) {
      logger.error('PAYMENTS', `Error fetching analytics: ${error.message}`);
      throw error;
    }
  }
}

export const paymentsService = new PaymentsService();

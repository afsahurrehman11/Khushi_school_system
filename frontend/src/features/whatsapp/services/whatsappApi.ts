/**
 * WhatsApp API Service
 * Handles all WhatsApp-related API calls
 */
import { apiCallJSON, getAuthHeaders } from '../../../utils/api';
import {
  WhatsAppStatus,
  WhatsAppTemplate,
  WhatsAppLog,
  WhatsAppStats,
  SendMessageRequest,
  RecipientResponse,
  SendResult,
} from '../types';

const BASE_URL = '/api/whatsapp';

/**
 * Get WhatsApp connection status
 */
export const getWhatsAppStatus = async (): Promise<WhatsAppStatus> => {
  return apiCallJSON(`${BASE_URL}/status`);
};

/**
 * Attempt to reconnect WhatsApp
 */
export const reconnectWhatsApp = async (): Promise<{ success: boolean; status: WhatsAppStatus }> => {
  return apiCallJSON(`${BASE_URL}/reconnect`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
};

/**
 * Send WhatsApp message
 */
export const sendMessage = async (request: SendMessageRequest): Promise<SendResult> => {
  return apiCallJSON(`${BASE_URL}/send`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
};

/**
 * Get message templates
 */
export const getTemplates = async (): Promise<{ templates: WhatsAppTemplate[] }> => {
  return apiCallJSON(`${BASE_URL}/templates`);
};

/**
 * Create custom template
 */
export const createTemplate = async (template: Partial<WhatsAppTemplate>): Promise<WhatsAppTemplate> => {
  return apiCallJSON(`${BASE_URL}/templates`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(template),
  });
};

/**
 * Update template
 */
export const updateTemplate = async (
  templateId: string,
  template: Partial<WhatsAppTemplate>
): Promise<WhatsAppTemplate> => {
  return apiCallJSON(`${BASE_URL}/templates/${templateId}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(template),
  });
};

/**
 * Delete template
 */
export const deleteTemplate = async (templateId: string): Promise<{ success: boolean }> => {
  return apiCallJSON(`${BASE_URL}/templates/${templateId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
};

/**
 * Get message logs
 */
export const getMessageLogs = async (
  skip: number = 0,
  limit: number = 50
): Promise<{ logs: WhatsAppLog[]; skip: number; limit: number }> => {
  return apiCallJSON(`${BASE_URL}/logs?skip=${skip}&limit=${limit}`);
};

/**
 * Get message statistics
 */
export const getMessageStats = async (): Promise<WhatsAppStats> => {
  return apiCallJSON(`${BASE_URL}/stats`);
};

/**
 * Get potential recipients based on filters
 */
export const getRecipients = async (
  recipientType: string,
  classId?: string,
  sectionId?: string,
  search?: string
): Promise<RecipientResponse> => {
  let url = `${BASE_URL}/recipients?recipient_type=${recipientType}`;
  if (classId) url += `&class_id=${classId}`;
  if (sectionId) url += `&section_id=${sectionId}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  return apiCallJSON(url);
};

/**
 * Get automation rules (coming soon)
 */
export const getAutomationRules = async (): Promise<any> => {
  return apiCallJSON(`${BASE_URL}/automation`);
};

export default {
  getWhatsAppStatus,
  reconnectWhatsApp,
  sendMessage,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getMessageLogs,
  getMessageStats,
  getRecipients,
  getAutomationRules,
};

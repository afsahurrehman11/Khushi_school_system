/**
 * WhatsApp module types
 */

export interface WhatsAppStatus {
  connected: boolean;
  phone_number: string | null;
  business_name: string | null;
  last_checked: string;
  error?: string;
  simulated?: boolean;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  type: string;
  content: string;
  variables: string[];
  is_default?: boolean;
  is_active?: boolean;
}

export interface WhatsAppLog {
  id: string;
  school_id: string;
  message: string;
  template_type?: string;
  recipient_type: string;
  class_id?: string;
  section_id?: string;
  student_ids: string[];
  recipient_phones: string[];
  recipients_count: number;
  sent_by: string;
  status: 'pending' | 'sent' | 'failed' | 'scheduled' | 'cancelled' | 'partial';
  scheduled_time?: string;
  sent_at?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppStats {
  total_messages: number;
  total_recipients: number;
  sent: number;
  pending: number;
  scheduled: number;
  failed: number;
}

export interface SendMessageRequest {
  message: string;
  template_type?: string;
  recipient_type: 'entire_school' | 'specific_class' | 'specific_section' | 'specific_students';
  class_id?: string;
  section_id?: string;
  student_ids?: string[];
  schedule_time?: string;
}

export interface Recipient {
  id: string;
  student_id: string;
  full_name: string;
  class_id: string;
  section: string;
  parent_phone: string;
  phone_valid: boolean;
  whatsapp_opt_in: boolean;
}

export interface RecipientResponse {
  recipients: Recipient[];
  total: number;
  valid_phone_count: number;
}

export interface SendResult {
  success: boolean;
  log_id?: string;
  total?: number;
  success_count?: number;
  failed?: number;
  invalid?: number;
  scheduled?: boolean;
  scheduled_for?: string;
}

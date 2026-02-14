// ===================== Student Import / Export Types =====================

export interface ImportPreviewResponse {
  import_id: string;
  file_name: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  errors: ImportError[];
  duplicate_action: string;
  preview_data: ImportPreviewRow[];
}

export interface ImportPreviewRow {
  row_num: number;
  student_id: string;
  full_name: string;
  roll_number: string;
  class_id: string;
  section: string;
  gender: string;
  date_of_birth: string;
  parent_name: string;
  parent_contact: string;
  address: string;
  admission_date: string;
}

export interface ImportError {
  row: number;
  column: string;
  value: string;
  reason: string;
}

export interface ImportStatusResponse {
  import_id: string;
  status: 'pending' | 'processing' | 'completed' | 'completed_with_errors' | 'failed';
  file_name: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  duplicate_count: number;
  errors: ImportError[];
}

export interface ImportLogEntry {
  id: string;
  file_name: string;
  imported_by: string;
  imported_by_name: string;
  timestamp: string;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  duplicate_count: number;
  status: string;
}

export interface ImportConfirmResponse {
  message: string;
  import_id: string;
}

export interface ImportNotification {
  type: 'import_complete' | 'connected';
  import_id?: string;
  status?: string;
  successful_rows?: number;
  failed_rows?: number;
  file_name?: string;
  message?: string;
  timestamp?: string;
}

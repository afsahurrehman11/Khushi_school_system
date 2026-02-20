/**
 * Face Recognition Types
 */

export interface FaceSettings {
  id?: string;
  school_id: string;
  school_start_time: string;
  late_after_time: string;
  auto_absent_time: string;
  employee_checkin_time: string;
  employee_late_after: string;
  employee_checkout_time: string;
  confidence_threshold: number;
  max_retry_attempts: number;
  students_enabled: boolean;
  employees_enabled: boolean;
}

export interface FaceStatus {
  facenet_available: boolean;
  device: string;
  cache_loaded: boolean;
  cached_students: number;
  cached_employees: number;
  ready: boolean;
}

export interface ClassStats {
  class_id: string;
  section: string;
  total: number;
  face_ready: number;
  pending: number;
}

export interface EmployeeStats {
  total: number;
  face_ready: number;
  pending: number;
}

export interface DashboardStats {
  classes: ClassStats[];
  employees: EmployeeStats;
}

export interface FaceActivity {
  id: string;
  person_type: 'student' | 'employee';
  person_name: string;
  action: 'present' | 'late' | 'check_in' | 'check_out';
  confidence: number;
  class_id?: string;
  section?: string;
  time: string;
}

export interface StudentFace {
  id: string;
  student_id: string;
  full_name: string;
  class_id: string;
  section: string;
  roll_number: string;
  profile_image_url?: string;
  embedding_status: 'pending' | 'generated' | 'failed';
  embedding_generated_at?: string;
  has_image: boolean;
}

export interface EmployeeFace {
  id: string;
  teacher_id: string;
  name: string;
  email?: string;
  phone?: string;
  profile_image_url?: string;
  embedding_status: 'pending' | 'generated' | 'failed';
  embedding_generated_at?: string;
  has_image: boolean;
}

export interface ClassInfo {
  id: string;
  class_name: string;
  section: string;
  total_students: number;
  face_ready: number;
  pending: number;
}

export interface RecognitionMatch {
  person_type: 'student' | 'employee';
  person_id: string;
  name: string;
  student_id?: string;
  teacher_id?: string;
  class_id?: string;
  section?: string;
  roll_number?: string;
  email?: string;
  profile_image_url?: string;
  confidence: number;
}

export interface RecognitionResult {
  status: 'success' | 'retry' | 'error';
  reason?: 'no_face' | 'low_confidence' | 'blurry' | string;
  message?: string;
  match?: RecognitionMatch;
  attendance?: AttendanceResult;
}

export interface AttendanceResult {
  already_marked?: boolean;
  action?: 'check_in' | 'check_out' | 'already_checked_out';
  status?: 'present' | 'late';
  name: string;
  student_id?: string;
  teacher_id?: string;
  class_id?: string;
  section?: string;
  roll_number?: string;
  time: string;
  confidence: number;
}

export interface GenerateResult {
  total: number;
  success: number;
  failed: number;
}

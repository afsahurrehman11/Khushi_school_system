// ===================== Student Import / Export Types =====================

export interface ImportPreviewResponse {
  import_id: string;
  file_name: string;
  zip_file_name?: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  errors: ImportError[];
  duplicate_action: string;
  preview_data: ImportPreviewRow[];
  has_images?: boolean;
  missing_columns?: string[];
  column_mapping_used?: Record<string, number>;
}

export interface ImportPreviewRow {
  row_num: number;
  registration_number: string;
  full_name: string;
  roll_number: string;
  class_id: string;
  section: string;
  gender: string;
  date_of_birth: string;
  father_name: string;
  parent_contact: string;
  address: string;
  admission_date: string;
  image_name?: string;
}

export interface ImportError {
  row: number;
  column: string;
  value: string;
  reason: string;
  status?: 'skipped' | 'warning';
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

// Incomplete Students Types
export interface IncompleteStudent {
  id: string;
  student_id: string;
  registration_number: string;
  full_name: string;
  roll_number: string;
  class_id: string;
  section: string;
  missing_fields: string[];
  current_data: {
    gender: string;
    date_of_birth: string;
    father_name: string;
    father_cnic: string;
    parent_contact: string;
    address: string;
  };
}

export interface IncompleteStudentsClass {
  class_id: string;
  class_name: string;
  students: IncompleteStudent[];
  total_missing_fields: number;
}

export interface IncompleteStudentsResponse {
  total_incomplete_students: number;
  classes: IncompleteStudentsClass[];
}

// Column mapping for import
export const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'full_name', 'student_name', 'fullname', 'student'],
  roll_number: ['roll_number', 'roll_no', 'rollno', 'roll', 'rollnumber'],
  registration_number: ['registration_number', 'reg_number', 'reg_no', 'regno', 'registration', 'reg', 'student_id', 'studentid', 'id'],
  class: ['class', 'class_name', 'classname', 'grade', 'standard', 'class_id'],
  section: ['section', 'sec', 'division', 'div'],
  father_name: ['father_name', 'fathername', 'father', 'parent_name', 'parentname', 'guardian_name', 'guardianname'],
  father_cnic: ['father_cnic', 'parent_cnic', 'cnic', 'b_form', 'bform', 'nic'],
  gender: ['gender', 'sex'],
  date_of_birth: ['date_of_birth', 'dob', 'dateofbirth', 'birth_date', 'birthdate'],
  parent_contact: ['parent_contact', 'parentcontact', 'phone', 'contact', 'mobile', 'guardian_contact', 'guardiancontact'],
  address: ['address', 'home_address', 'homeaddress', 'residence'],
  admission_date: ['admission_date', 'admissiondate', 'joining_date', 'joiningdate', 'enrolled_date'],
  image_name: ['image_name', 'imagename', 'photo', 'picture', 'image', 'photo_name', 'photoname'],
};

export const REQUIRED_COLUMNS = ['name', 'roll_number', 'registration_number', 'class'];

export const MISSING_FIELD_LABELS: Record<string, string> = {
  section: 'Section',
  gender: 'Gender',
  date_of_birth: 'Date of Birth',
  father_name: 'Father Name',
  father_cnic: 'Father CNIC',
  parent_contact: 'Phone Number',
  address: 'Address',
  profile_image: 'Profile Photo',
};

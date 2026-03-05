/**
 * Face Recognition API Service
 */
import { apiCallJSON } from '../../../utils/api';
import { authService } from '../../../services/auth';
import { deduplicatedFetch } from '../../../utils/requestDeduplication';
import type {
  FaceSettings,
  FaceStatus,
  DashboardStats,
  FaceActivity,
  StudentFace,
  EmployeeFace,
  ClassInfo,
  RecognitionResult,
  GenerateResult,
  TodaySummary,
  StudentAttendanceDetail,
  TeacherAttendanceDetail,
  HourlyStats,
  LateArrival,
  AbsentGroup,
  DebugRanking,
  CacheStats,
  CombinedDashboardData,
} from '../types';

const BASE_URL = '/api/face';

// ============ Status ============

export async function getFaceStatus(): Promise<FaceStatus> {
  return apiCallJSON(`${BASE_URL}/status`);
}

// ============ Dashboard ============

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiCallJSON(`${BASE_URL}/dashboard/stats`);
}

export async function getTodayActivity(limit: number = 50): Promise<{ activities: FaceActivity[] }> {
  return apiCallJSON(`${BASE_URL}/dashboard/activity?limit=${limit}`);
}

// OPTIMIZED: Combined dashboard endpoint with request deduplication
// This prevents duplicate calls when multiple components mount simultaneously
export async function getCombinedDashboard(): Promise<CombinedDashboardData> {
  return deduplicatedFetch(
    'dashboard-combined',
    () => apiCallJSON(`${BASE_URL}/dashboard/combined`),
    5000 // 5 second deduplication window
  );
}

// Legacy individual endpoints (kept for backward compatibility)
export async function getTodaySummary(): Promise<TodaySummary> {
  return apiCallJSON(`${BASE_URL}/dashboard/summary`);
}

export async function getTodayStudentDetails(): Promise<{ students: StudentAttendanceDetail[] }> {
  return apiCallJSON(`${BASE_URL}/dashboard/students/today`);
}

export async function getTodayTeacherDetails(): Promise<{ teachers: TeacherAttendanceDetail[] }> {
  return apiCallJSON(`${BASE_URL}/dashboard/teachers/today`);
}

export async function getHourlyStats(): Promise<HourlyStats> {
  return apiCallJSON(`${BASE_URL}/dashboard/hourly-stats`);
}

export async function getLateArrivalsStudents(): Promise<{ late_students: LateArrival[]; count: number }> {
  return apiCallJSON(`${BASE_URL}/dashboard/late-arrivals/students`);
}

export async function getLateArrivalsTeachers(): Promise<{ late_teachers: LateArrival[]; count: number }> {
  return apiCallJSON(`${BASE_URL}/dashboard/late-arrivals/teachers`);
}

export async function getAbsentStudents(): Promise<{ absent_groups: AbsentGroup[]; total_absent: number }> {
  return apiCallJSON(`${BASE_URL}/dashboard/absent-students`);
}

// ============ Debug Mode ============

export async function getDebugRankings(imageBlob: Blob): Promise<{ total_comparisons: number; rankings: DebugRanking[] }> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'debug.jpg');

  const token = authService.getToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const url = `${window.location.origin.replace('5173', '8000')}${BASE_URL}/debug/rankings`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Debug rankings failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getCacheStats(): Promise<CacheStats> {
  return apiCallJSON(`${BASE_URL}/debug/cache-stats`);
}

// ============ Recognition ============

export async function recognizeFace(imageBlob: Blob, personType?: 'student' | 'employee'): Promise<RecognitionResult> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'capture.jpg');

  const token = authService.getToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const url = `${window.location.origin.replace('5173', '8000')}${BASE_URL}/recognize${personType ? `?person_type=${personType}` : ''}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Recognition failed: ${response.statusText}`);
  }

  return response.json();
}

export async function loadEmbeddingsCache(): Promise<{ success: boolean; loaded: { students: number; employees: number } }> {
  return apiCallJSON(`${BASE_URL}/load-cache`, { method: 'POST' });
}

// ============ Embedding Generation ============

export async function generateMissingEmbeddings(
  personType: 'student' | 'employee',
  classId?: string
): Promise<GenerateResult> {
  return apiCallJSON(`${BASE_URL}/generate/missing`, {
    method: 'POST',
    body: JSON.stringify({ person_type: personType, class_id: classId }),
  });
}

export async function refreshAllEmbeddings(
  personType: 'student' | 'employee',
  classId?: string
): Promise<GenerateResult> {
  return apiCallJSON(`${BASE_URL}/generate/refresh`, {
    method: 'POST',
    body: JSON.stringify({ person_type: personType, class_id: classId }),
  });
}

export async function regenerateSingleEmbedding(
  personType: 'student' | 'employee',
  personId: string
): Promise<{ success: boolean; error?: string }> {
  return apiCallJSON(`${BASE_URL}/generate/single`, {
    method: 'POST',
    body: JSON.stringify({ person_type: personType, person_id: personId }),
  });
}

// ============ People Lists ============

export async function getStudentsForFace(
  classId?: string,
  statusFilter?: 'all' | 'ready' | 'pending' | 'failed'
): Promise<{ students: StudentFace[] }> {
  const params = new URLSearchParams();
  if (classId) params.append('class_id', classId);
  if (statusFilter && statusFilter !== 'all') params.append('status_filter', statusFilter);
  
  const query = params.toString();
  return apiCallJSON(`${BASE_URL}/students${query ? `?${query}` : ''}`);
}

export async function getEmployeesForFace(
  statusFilter?: 'all' | 'ready' | 'pending' | 'failed'
): Promise<{ employees: EmployeeFace[] }> {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== 'all') params.append('status_filter', statusFilter);
  
  const query = params.toString();
  return apiCallJSON(`${BASE_URL}/employees${query ? `?${query}` : ''}`);
}

export async function getClassesForFace(): Promise<{ classes: ClassInfo[] }> {
  return apiCallJSON(`${BASE_URL}/classes`);
}

// ============ Image Upload ============

export async function uploadFaceImage(
  personType: 'student' | 'employee',
  personId: string,
  imageBlob: Blob
): Promise<{ success: boolean; image_url?: string; embedding_status?: string; embedding_error?: string }> {
  const formData = new FormData();
  formData.append('file', imageBlob, 'face.jpg');

  const token = authService.getToken();
  if (!token) {
    throw new Error('No authentication token available');
  }

  const response = await fetch(
    `${window.location.origin.replace('5173', '8000')}${BASE_URL}/upload-image/${personType}/${personId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json();
}

// ============ Settings ============

export async function getFaceSettings(): Promise<FaceSettings> {
  return apiCallJSON(`${BASE_URL}/settings`);
}

export async function updateFaceSettings(updates: Partial<FaceSettings>): Promise<FaceSettings> {
  // Filter out readonly fields that backend doesn't accept
  const { id, school_id, created_at, updated_at, ...updateData } = updates as any;
  // Ensure required fields are present; backend validation returns 422 if missing
  if (updateData.confidence_threshold === undefined || updateData.confidence_threshold === null) {
    updateData.confidence_threshold = 0.9; // default to 90% if UI omitted it
  }
  if (updateData.max_retry_attempts === undefined || updateData.max_retry_attempts === null) {
    updateData.max_retry_attempts = 5; // sensible default
  }

  return apiCallJSON(`${BASE_URL}/settings`, {
    method: 'PUT',
    body: JSON.stringify(updateData),
  });
}

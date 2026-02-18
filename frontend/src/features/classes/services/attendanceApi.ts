import { apiCallJSON } from '../../../utils/api';

const BASE = '/api/attendance';

// Get all attendance dates for a class (latest first)
export async function getAttendanceDates(classId: string, limit: number = 100) {
  return await apiCallJSON(`${BASE}/${classId}?limit=${limit}`, { method: 'GET' });
}

// Get all attendance records for a specific date
export async function getAttendanceForDate(classId: string, date: string) {
  return await apiCallJSON(`${BASE}/${classId}/${date}`, { method: 'GET' });
}

// Get attendance summary for a specific date
export async function getAttendanceSummary(classId: string, date: string) {
  return await apiCallJSON(`${BASE}/${classId}/${date}/summary`, { method: 'GET' });
}

// Mark or update attendance for a student
export async function markAttendance(payload: {
  class_id: string;
  student_id: string;
  date: string;
  status: 'present' | 'absent' | 'late';
  notes?: string;
}) {
  // Add a timeout using AbortController to avoid hanging requests
  const controller = new AbortController();
  const timeoutMs = 10000; // 10 seconds
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await apiCallJSON(`${BASE}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      // pass signal to underlying fetch; cast to any for RequestInit compatibility
      signal: (controller as any).signal,
    } as RequestInit);
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// Mark attendance batch (multiple students)
export async function markAttendanceBatch(
  classId: string,
  date: string,
  records: Array<{ student_id: string; status: 'present' | 'absent' | 'late' }>
) {
  const promises = records.map(record =>
    markAttendance({
      class_id: classId,
      student_id: record.student_id,
      date,
      status: record.status
    })
  );
  return await Promise.all(promises);
}

// Mark attendance from face recognition
export async function markFaceAttendance(payload: {
  class_id: string;
  student_id: string;
  date?: string;
  confidence: number;
}) {
  return await apiCallJSON(`${BASE}/face-mark`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });
}

// Get attendance records for a student
export async function getStudentAttendance(
  studentId: string,
  fromDate?: string,
  toDate?: string
) {
  let url = `${BASE}/student/${studentId}`;
  const params = [];
  if (fromDate) params.push(`from_date=${fromDate}`);
  if (toDate) params.push(`to_date=${toDate}`);
  if (params.length > 0) url += `?${params.join('&')}`;
  
  return await apiCallJSON(url, { method: 'GET' });
}

// Get class attendance statistics
export async function getClassAttendanceStats(classId: string) {
  return await apiCallJSON(`${BASE}/class/${classId}/stats`, { method: 'GET' });
}

import { apiCallJSON } from '../../../utils/api';

const BASE = '/api/subjects';

export async function getSubjects() {
  return await apiCallJSON(`${BASE}`, { method: 'GET' });
}

export async function createSubject(payload: any) {
  return await apiCallJSON(`${BASE}`, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
}

export async function updateSubject(id: string, payload: any) {
  return await apiCallJSON(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
}

export async function deleteSubject(id: string) {
  return await apiCallJSON(`${BASE}/${id}`, { method: 'DELETE' });
}

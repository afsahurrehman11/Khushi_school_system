import { apiCallJSON } from '../../../utils/api';

const BASE = '/api/chalans';

export async function getChalans() {
  return await apiCallJSON(`${BASE}`, { method: 'GET' });
}

export async function getChalanById(id: string) {
  return await apiCallJSON(`${BASE}/${id}`, { method: 'GET' });
}

export async function createChalan(payload: any) {
  return await apiCallJSON(`${BASE}`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function updateChalan(id: string, payload: any) {
  return await apiCallJSON(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function deleteChalan(id: string) {
  return await apiCallJSON(`${BASE}/${id}`, { method: 'DELETE' });
}

export async function getChalansByStudent(studentId: string) {
  return await apiCallJSON(`${BASE}/student/${studentId}`, { method: 'GET' });
}

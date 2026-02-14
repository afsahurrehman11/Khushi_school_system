import { apiCallJSON } from '../../../utils/api';

const BASE = '/api/classes';

export async function getClasses() {
  return await apiCallJSON(`${BASE}`, { method: 'GET' });
}

export async function createClass(payload: any) {
  return await apiCallJSON(`${BASE}`, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
}

export async function updateClass(id: string, payload: any) {
  return await apiCallJSON(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
}

export async function deleteClass(id: string) {
  return await apiCallJSON(`${BASE}/${id}`, { method: 'DELETE' });
}

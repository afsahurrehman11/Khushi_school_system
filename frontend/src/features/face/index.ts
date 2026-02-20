/**
 * Face App Feature Module
 * Exports all face recognition components, pages, services, and types
 */

// Pages
export { default as FaceDashboard } from './pages/FaceDashboard';
export { default as FaceStudents } from './pages/FaceStudents';
export { default as FaceEmployees } from './pages/FaceEmployees';
export { default as FaceRecognition } from './pages/FaceRecognition';
export { default as FaceSettings } from './pages/FaceSettings';

// Services
export * from './services/faceApi';

// Types
export * from './types';

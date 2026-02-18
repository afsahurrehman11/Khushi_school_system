/**
 * TypeScript Types & Interfaces for Module 1: SaaS Foundation
 * All types include school_id for multi-tenant isolation
 */

/**
 * School Type - Core multi-tenant entity
 */
export interface School {
  id: string;
  name: string; // lowercase in DB
  displayName: string; // first letter capitalized
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  logo?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

/**
 * User Types - Root and Admin
 */
export type UserRole = "Root" | "Admin" | "Accountant" | "Teacher" | "Student";

export interface RootUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: "Root";
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface AdminUser {
  id: string;
  school_id: string; // linked to one school
  email: string;
  name: string;
  phone?: string;
  role: "Admin";
  permissions?: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface AccountantUser {
  id: string;
  school_id: string;
  email: string;
  name: string;
  phone?: string;
  role: "Accountant";
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export type User = RootUser | AdminUser | AccountantUser;

/**
 * Auth Types
 */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface TokenPayload {
  sub: string; // user_id
  email: string;
  role: UserRole;
  school_id?: string;
  iat: number;
  exp: number;
}

/**
 * Student Type
 */
export interface Student {
  id: string;
  school_id: string;
  rollNumber: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email?: string;
  phone?: string;
  gender?: "M" | "F" | "Other";
  classId: string;
  section?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  photo?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

/**
 * Teacher Type
 */
export interface Teacher {
  id: string;
  school_id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: "M" | "F" | "Other";
  qualification?: string;
  experience?: number;
  specialization?: string[];
  subjectIds: string[];
  classIds: string[];
  photo?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

/**
 * Class Type
 */
export interface Class {
  id: string;
  school_id: string;
  name: string;
  section?: string;
  grade?: string;
  classTeacherId?: string;
  capacity?: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

/**
 * Subject Type
 */
export interface Subject {
  id: string;
  school_id: string;
  name: string;
  code?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

/**
 * Grade Type
 */
export interface Grade {
  id: string;
  school_id: string;
  studentId: string;
  subjectId: string;
  value: number; // 0-100
  term: string; // "Term 1", "Term 2", etc.
  gradeLetter?: string; // A, B, C, etc.
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fee Types
 */
export interface FeeCategory {
  id: string;
  school_id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Fee {
  id: string;
  school_id: string;
  name: string;
  amount: number;
  categoryId: string;
  dueDateMonth?: number;
  dueDateDay?: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface ClassFeeAssignment {
  id: string;
  school_id: string;
  classId: string;
  feeCategoryId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeePayment {
  id: string;
  school_id: string;
  studentId: string;
  feeId: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentDate: string;
  paymentMethod?: string;
  referenceNumber?: string;
  receivedBy?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Chalan {
  id: string;
  school_id: string;
  studentId: string;
  challanNumber: string;
  amount: number;
  feeCategoryId?: string;
  dueDate: string;
  issuedDate: string;
  paidDate?: string;
  status: "pending" | "paid" | "overdue";
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payment Types
 */
export interface PaymentMethod {
  id: string;
  school_id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface Payment {
  id: string;
  school_id: string;
  studentId: string;
  feePaymentId?: string;
  amount: number;
  paymentDate: string;
  method: string;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Accountant Types
 */
export interface AccountantProfile {
  id: string;
  school_id: string;
  userId: string;
  openingBalance: number;
  currentBalance: number;
  totalCollected: number;
  lastUpdated: string;
  createdAt: string;
}

export interface AccountantDailySummary {
  id: string;
  school_id: string;
  accountantId: string;
  date: string;
  openingBalance: number;
  collections: Record<string, number>;
  totalCollected: number;
  closingBalance: number;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

export interface AccountantTransaction {
  id: string;
  school_id: string;
  accountantId: string;
  amount: number;
  type: "collection" | "withdrawal" | "adjustment";
  description: string;
  recordedBy: string;
  createdAt: string;
}

/**
 * Notification Type
 */
export interface Notification {
  id: string;
  school_id: string;
  userEmail: string;
  type: string;
  channel: "in-app" | "email" | "sms";
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

/**
 * Import Log Type
 */
export interface ImportLog {
  id: string;
  school_id: string;
  fileName: string;
  importedBy: string;
  importedByName?: string;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  duplicateCount: number;
  status: "pending" | "processing" | "completed" | "completed_with_errors" | "failed";
  errors: ImportError[];
  timestamp: string;
}

export interface ImportError {
  row: number;
  column: string;
  value: string;
  reason: string;
}

/**
 * API Response Types
 */
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  status: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Dashboard Types
 */
export interface DashboardStats {
  totalStudents: number;
  totalTeachers: number;
  totalClasses: number;
  totalFeeCollected: number;
  pendingFees: number;
  totalFees: number;
}

export interface SchoolDashboardStats extends DashboardStats {
  totalAdmins: number;
  totalSchools: number;
}

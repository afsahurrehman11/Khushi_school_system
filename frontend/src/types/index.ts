/**
 * TypeScript Types & Interfaces for Module 1: SaaS Foundation
 * All types include school_id for multi-tenant isolation
 */

/**
 * SaaS School Plans
 */
export type SchoolPlan = "trial" | "basic" | "standard" | "premium" | "enterprise";

/**
 * SaaS School Status
 */
export type SchoolStatus = "active" | "suspended" | "deleted" | "pending";

/**
 * SaaS School Type - For root admin management
 */
export interface SaaSSchool {
  id: string;
  school_id: string;
  school_name: string;
  database_name: string;
  admin_email: string;
  plan: SchoolPlan;
  status: SchoolStatus;
  email?: string;
  phone?: string;
  city?: string;
  created_at: string;
  student_count: number;
  teacher_count: number;
  storage_bytes: number;
}

/**
 * SaaS School Create Request
 */
export interface SaaSSchoolCreate {
  school_name: string;
  admin_email: string;
  admin_password: string;
  admin_name?: string;
  plan?: SchoolPlan;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
}

/**
 * SaaS Overview Stats
 */
export interface SaaSOverviewStats {
  total_schools: number;
  active_schools: number;
  suspended_schools: number;
  total_students: number;
  total_teachers: number;
  total_storage_bytes: number;
  trial_schools: number;
  basic_schools: number;
  standard_schools: number;
  premium_schools: number;
  enterprise_schools: number;
}

/**
 * Storage History Item
 */
export interface StorageHistoryItem {
  date: string;
  storage_bytes: number;
}

/**
 * School Storage History
 */
export interface SchoolStorageHistory {
  school_id: string;
  school_name: string;
  history: StorageHistoryItem[];
}

// ================= Billing Types =================

/**
 * Billing Period Type
 */
export type BillingPeriod = "monthly" | "quarterly" | "yearly";

/**
 * Invoice Status Type
 */
export type InvoiceStatus = "draft" | "pending" | "paid" | "overdue" | "cancelled";

/**
 * Billing Configuration
 */
export interface BillingConfig {
  id?: string;
  total_mongo_cost: number;
  billing_period: BillingPeriod;
  period_start: string;
  period_end: string;
  fixed_cpu_ram_cost: number;
  dynamic_storage_cost: number;
  markup_percentage: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
}

/**
 * Billing Config Create Request
 */
export interface BillingConfigCreate {
  total_mongo_cost: number;
  billing_period: BillingPeriod;
  period_start: string;
  period_end: string;
  fixed_cpu_ram_cost: number;
  dynamic_storage_cost: number;
  markup_percentage?: number;
}

/**
 * Cost Breakdown
 */
export interface CostBreakdown {
  fixed_cost: number;
  storage_cost: number;
  base_total: number;
  markup_amount: number;
  subtotal: number;
  misc_charges: number;
  misc_charges_description?: string;
  crash_recovery_charges: number;
  urgent_recovery_charges: number;
  discount: number;
  discount_description?: string;
  total: number;
}

/**
 * Invoice Type
 */
export interface Invoice {
  id: string;
  invoice_number: string;
  school_id: string;
  school_name: string;
  database_name?: string;
  billing_period: BillingPeriod;
  period_start: string;
  period_end: string;
  storage_bytes: number;
  storage_percentage: number;
  student_count: number;
  teacher_count: number;
  cost_breakdown: CostBreakdown;
  status: InvoiceStatus;
  notes?: string;
  internal_notes?: string;
  created_at: string;
  updated_at: string;
  issued_at?: string;
  paid_at?: string;
  due_date?: string;
  total_amount: number;
}

/**
 * Invoice Create Request
 */
export interface InvoiceCreate {
  school_id: string;
  billing_period?: BillingPeriod;
  period_start: string;
  period_end: string;
  due_date?: string;
  notes?: string;
}

/**
 * Invoice Update Request
 */
export interface InvoiceUpdate {
  misc_charges?: number;
  misc_charges_description?: string;
  crash_recovery_charges?: number;
  urgent_recovery_charges?: number;
  discount?: number;
  discount_description?: string;
  status?: InvoiceStatus;
  notes?: string;
  internal_notes?: string;
  due_date?: string;
}

/**
 * Bulk Invoice Generate Request
 */
export interface BulkInvoiceGenerate {
  billing_period?: BillingPeriod;
  period_start: string;
  period_end: string;
  due_date?: string;
}

/**
 * Revenue Analytics
 */
export interface RevenueAnalytics {
  total_predicted_revenue: number;
  total_mongo_cost: number;
  total_profit: number;
  profit_margin_percentage: number;
  current_period_revenue: number;
  previous_period_revenue: number;
  revenue_growth_percentage: number;
  revenue_by_plan: Record<string, number>;
}

/**
 * Storage Analytics
 */
export interface StorageAnalytics {
  total_storage_bytes: number;
  average_storage_per_school: number;
  top_schools: Array<{
    school_id: string;
    school_name: string;
    storage_bytes: number;
    percentage: number;
  }>;
  storage_distribution: Array<{
    school_name: string;
    storage_bytes: number;
  }>;
}

/**
 * Billing Analytics
 */
export interface BillingAnalytics {
  revenue: RevenueAnalytics;
  storage: StorageAnalytics;
  total_invoices: number;
  draft_invoices: number;
  pending_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  schools_exceeding_storage: Array<{
    school_id: string;
    school_name: string;
    storage_bytes: number;
  }>;
  schools_exceeding_budget: Array<{
    school_id: string;
    school_name: string;
  }>;
}

/**
 * Billing Change Log
 */
export interface BillingChangeLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  performed_by: string;
  performed_at: string;
  ip_address?: string;
}

/**
 * School Billing History Item
 */
export interface SchoolBillingHistoryItem {
  period: string;
  total: number;
  storage_bytes: number;
}

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

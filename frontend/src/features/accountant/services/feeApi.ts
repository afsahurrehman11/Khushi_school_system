import api from '../../../utils/api';
import logger from '../../../utils/logger';

export const feeCategoriesApi = {
  // List all fee categories
  getAllCategories: async (includeArchived = false) => {
    try {
      logger.info('[FEE]', `Fetching categories (archived: ${includeArchived})`);
      const result = await api.get(`/fee-categories?include_archived=${includeArchived}`);
      logger.info('[FEE]', `✅ Fetched ${Array.isArray(result) ? result.length : 0} categories`);
      return result;
    } catch (err) {
      logger.error('[FEE]', `❌ Failed to fetch categories: ${String(err)}`);
      throw err;
    }
  },

  // Get single category
  getCategory: async (categoryId: string) => {
    try {
      logger.info('[FEE]', `Fetching category: ${categoryId}`);
      const result = await api.get(`/fee-categories/${categoryId}`);
      logger.info('[FEE]', '✅ Fetched category');
      return result;
    } catch (err) {
      logger.error('[FEE]', `❌ Failed to fetch category: ${String(err)}`);
      throw err;
    }
  },

  // Create new category
  createCategory: async (data: {
    name: string;
    description?: string;
    components: { component_name: string; amount: number }[];
  }) => {
    try {
      logger.info('[FEE]', `Creating category with name: "${data.name}", ${data.components.length} components`);
      
      const result = await api.post('/fee-categories', data);
      logger.info('[FEE]', '✅ Category created successfully');
      return result;
    } catch (err: any) {
      const errorMsg = err?.response?.data?.detail || err?.message || String(err);
      logger.error('[FEE]', `❌ Failed to create category: ${errorMsg}`);
      // Re-throw with better message
      throw new Error(errorMsg || 'Failed to create fee category');
    }
  },

  // Update category
  updateCategory: async (categoryId: string, data: any) => {
    try {
      logger.info('[FEE]', `Updating category: ${categoryId}`);
      const result = await api.put(`/fee-categories/${categoryId}`, data);
      logger.info('[FEE]', '✅ Category updated');
      return result;
    } catch (err) {
      logger.error('[FEE]', `❌ Failed to update category: ${String(err)}`);
      throw err;
    }
  },

  // Archive category
  deleteCategory: async (categoryId: string) => {
    try {
      logger.info('[FEE]', `Deleting category: ${categoryId}`);
      const result = await api.delete(`/fee-categories/${categoryId}`);
      logger.info('[FEE]', '✅ Category deleted');
      return result;
    } catch (err) {
      logger.error('[FEE]', `❌ Failed to delete category: ${String(err)}`);
      throw err;
    }
  },

  // Duplicate category
  duplicateCategory: async (categoryId: string, newName: string) => {
    try {
      logger.info('[FEE]', `Duplicating category: ${categoryId} -> "${newName}"`);
      const result = await api.post(`/fee-categories/${categoryId}/duplicate`, { new_name: newName });
      logger.info('[FEE]', '✅ Category duplicated');
      return result;
    } catch (err) {
      logger.error('[FEE]', `❌ Failed to duplicate category: ${String(err)}`);
      throw err;
    }
  },
};

export const classAssignmentsApi = {
  // Get all active assignments
  getAllAssignments: async () => {
    return api.get('/class-fee-assignments');
  },

  // Get active category for a class
  getClassCategory: async (classId: string) => {
    return api.get(`/class-fee-assignments/classes/${classId}/active`);
  },

  // Get assignment history for a class
  getClassHistory: async (classId: string) => {
    return api.get(`/class-fee-assignments/classes/${classId}/history`);
  },

  // Get classes using a category
  getCategoryUsage: async (categoryId: string) => {
    return api.get(`/class-fee-assignments/categories/${categoryId}/classes`);
  },

  // Assign category to class
  assignCategory: async (classId: string, categoryId: string, applyToExisting: boolean = false) => {
    return api.post('/class-fee-assignments', { class_id: classId, category_id: categoryId, apply_to_existing: applyToExisting });
  },

  // Update assignment
  updateAssignment: async (assignmentId: string, categoryId: string) => {
    return api.put(`/class-fee-assignments/${assignmentId}`, { category_id: categoryId });
  },

  // Remove assignment
  removeAssignment: async (classId: string) => {
    return api.delete(`/class-fee-assignments/classes/${classId}`);
  },
};

export const challanApi = {
  // Get paginated challans with filters
  getChallans: async (params: { student_name?: string; roll_number?: string; class_id?: string; status?: string; page?: number; page_size?: number; sort_by?: string; sort_dir?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.student_name) p.append('student_name', params.student_name);
    if (params.roll_number) p.append('roll_number', params.roll_number);
    if (params.class_id) p.append('class_id', params.class_id);
    if (params.status) p.append('status', params.status);
    if (params.page) p.append('page', String(params.page));
    if (params.page_size) p.append('page_size', String(params.page_size));
    if (params.sort_by) p.append('sort_by', params.sort_by);
    if (params.sort_dir) p.append('sort_dir', params.sort_dir);
    return api.get(`/chalans?${p.toString()}`);
  },

  // Get student's challans
  getStudentChallans: async (studentId: string) => {
    return api.get(`/chalans/student/${studentId}`);
  },

  // Get class challans
  getClassChallans: async (classId: string) => {
    return api.get(`/chalans/class/${classId}`);
  },

  // Get single challan
  getChalan: async (chalanId: string) => {
    return api.get(`/chalans/${chalanId}`);
  },

  // Create challan from category
  createFromCategory: async (data: {
    student_id: string;
    class_id: string;
    category_id: string;
    due_date: string;
    issue_date?: string;
  }) => {
    return api.post('/chalans/from-category', data);
  },

  // Create bulk challans from category
  createBulkFromCategory: async (data: {
    class_id: string;
    student_ids: string[];
    category_id: string;
    due_date: string;
    issue_date?: string;
  }) => {
    return api.post('/chalans/batch/from-category', data);
  },

  // Search challans (paginated)
  search: async (criteria: { student_name?: string; roll_number?: string; class_id?: string; status?: string; page?: number; page_size?: number; sort_by?: string; sort_dir?: string } = {}) => {
    const params = new URLSearchParams();
    if (criteria.student_name) params.append('student_name', criteria.student_name);
    if (criteria.roll_number) params.append('roll_number', criteria.roll_number);
    if (criteria.class_id) params.append('class_id', criteria.class_id);
    if (criteria.status) params.append('status', criteria.status);
    if (criteria.page) params.append('page', String(criteria.page));
    if (criteria.page_size) params.append('page_size', String(criteria.page_size));
    if (criteria.sort_by) params.append('sort_by', criteria.sort_by);
    if (criteria.sort_dir) params.append('sort_dir', criteria.sort_dir);
    return api.get(`/chalans/search?${params.toString()}`);
  },

  // Update challan
  updateChalan: async (chalanId: string, data: any) => {
    return api.put(`/chalans/${chalanId}`, data);
  },

  // Delete challan
  deleteChalan: async (chalanId: string) => {
    return api.delete(`/chalans/${chalanId}`);
  },
};

export const paymentApi = {
  // Get all payments
  getAllPayments: async () => {
    return api.get('/payments');
  },

  // Get payments for challan
  getChallanPayments: async (chalanId: string) => {
    return api.get(`/challan/${chalanId}/payments`);
  },

  // Get student payments
  getStudentPayments: async (studentId: string) => {
    return api.get(`/students/${studentId}/payments`);
  },

  // Get student payment summary
  getStudentSummary: async (studentId: string) => {
    return api.get(`/students/${studentId}/payment-summary`);
  },

  // Record payment
  recordPayment: async (data: {
    challan_id: string;
    student_id: string;
    amount_paid: number;
    payment_method: string;
    transaction_reference?: string;
  }) => {
    return api.post('/payments', data);
  },

  // Update payment
  updatePayment: async (paymentId: string, data: any) => {
    return api.put(`/payments/${paymentId}`, data);
  },

  // Delete payment
  deletePayment: async (paymentId: string) => {
    return api.delete(`/payments/${paymentId}`);
  },
};

export const feesApi = {
  getFees: async (params: { student_id?: string; status?: string; page?: number; page_size?: number } = {}) => {
    const p = new URLSearchParams();
    if (params.student_id) p.append('student_id', params.student_id);
    if (params.status) p.append('status', params.status);
    if (params.page) p.append('page', String(params.page));
    if (params.page_size) p.append('page_size', String(params.page_size));
    if ((params as any).sort_by) p.append('sort_by', (params as any).sort_by);
    if ((params as any).sort_dir) p.append('sort_dir', (params as any).sort_dir);
    return api.get(`/fees?${p.toString()}`);
  },

  getFee: async (feeId: string) => {
    return api.get(`/fees/${feeId}`);
  },

  createFee: async (data: any) => {
    return api.post('/fees', data);
  },

  updateFee: async (feeId: string, data: any) => {
    return api.put(`/fees/${feeId}`, data);
  },

  deleteFee: async (feeId: string) => {
    return api.delete(`/fees/${feeId}`);
  },

  generateFees: async (data: { class_id?: string; fee_type: string; amount: number; due_date: string }) => {
    return api.post('/fees/generate', data);
  },

  // Search by student name / class / status
  searchFees: async (criteria: { student_name?: string; class_id?: string; status?: string }) => {
    const p = new URLSearchParams();
    if (criteria.student_name) p.append('student_name', criteria.student_name);
    if (criteria.class_id) p.append('class_id', criteria.class_id);
    if (criteria.status) p.append('status', criteria.status);
    return api.get(`/fees/search?${p.toString()}`);
  }
};

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../../../components/Button';
import { Edit2, Trash2, DollarSign, BookOpen } from 'lucide-react';
import Modal from '../../../components/Modal';
import { classAssignmentsApi, feeCategoriesApi } from '../../accountant/services/feeApi';
import logger from '../../../utils/logger';

interface Assignment { subject?: string; teacher?: string; time?: string }
interface Props { 
  id?: string; 
  name?: string; 
  code?: string; 
  onEdit?: () => void; 
  onDelete?: () => void; 
  assignments?: Assignment[];
  class_name?: string;
  section?: string;
}

const ClassCard: React.FC<Props> = ({ 
  id, name, code, onEdit, onDelete, assignments = [],
}) => {
  const navigate = useNavigate();
  const title = name || code || id || 'Untitled Class';
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [applyToExisting, setApplyToExisting] = useState(false);

  const handleCardClick = () => {
    if (id) {
      navigate(`/classes/${id}`);
    }
  };

  useEffect(() => {
    if (showFeeModal) {
      loadCategories();
      loadCurrentCategory();
    }
  }, [showFeeModal]);

  const loadCategories = async () => {
    try {
      const data = await feeCategoriesApi.getAllCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      logger.error('CLASSSC', `Error loading categories: ${String(err)}`);
    }
  };

  const loadCurrentCategory = async () => {
    if (!id) return;
    try {
      const data = await classAssignmentsApi.getClassCategory(id);
      if (data?.category_id) {
        setSelectedCategory(data.category_id);
      }
    } catch (err) {
      logger.error('CLASSSC', `Error loading current category: ${String(err)}`);
    }
  };

  const handleAssignCategory = async () => {
    if (!id || !selectedCategory) {
      alert('Please select a fee category');
      return;
    }

    setLoading(true);
    try {
      await classAssignmentsApi.assignCategory(id, selectedCategory, applyToExisting);
      alert('Fee category assigned successfully');
      setShowFeeModal(false);
    } catch (err) {
      logger.error('CLASSSC', `Error assigning category: ${String(err)}`);
      alert('Failed to assign fee category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01, y: -4 }}
        transition={{ duration: 0.3 }}
        onClick={handleCardClick}
        className="group bg-gradient-to-br from-blue-50 via-white to-purple-50 rounded-xl p-6 shadow-sm border-2 border-blue-100 hover:border-blue-300 hover:shadow-lg cursor-pointer transition-all"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center shadow-sm">
                {/* class/book icon */}
                <BookOpen className="w-6 h-6 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                {/* sanitize title to remove excessive em-dashes and normalize spacing */}
                <h4 className="font-bold text-xl text-blue-900 truncate">{(title || '').replace(/\u2014|\u2013|—|–/g, ' - ').trim()}</h4>
                {code && <p className="text-sm text-blue-600 font-medium">{code}</p>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Button 
              variant="success" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setShowFeeModal(true); }}
              title="Assign Fee Category"
              className="!p-2 !bg-green-50 !text-green-700 hover:!bg-green-100"
            >
              <DollarSign className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit?.(); }} className="!p-2 !bg-white/80 !text-gray-700 hover:!bg-gray-100">
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onDelete?.(); }} disabled={!id} className="!p-2 !bg-red-50 !text-red-700 hover:!bg-red-100">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Subject Assignments */}
        {assignments && assignments.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-gradient-to-r from-blue-200 via-purple-200 to-transparent"></div>
              <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Assigned Subjects</span>
              <div className="h-px flex-1 bg-gradient-to-l from-blue-200 via-purple-200 to-transparent"></div>
            </div>
            {assignments.slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-white/70 rounded-lg border border-blue-100 hover:border-blue-300 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-100 to-purple-200 text-purple-700 flex items-center justify-center text-xs font-bold shadow-sm">
                  {(a.subject||'').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-gray-800 truncate">{a.subject || 'No subject'}</div>
                  <div className="text-xs text-gray-600 truncate">{a.teacher || 'No teacher'}{a.time ? ` • ${a.time}` : ''}</div>
                </div>
              </div>
            ))}
            {assignments.length > 3 && (
              <p className="text-xs text-center text-blue-600 font-medium pt-1">+{assignments.length - 3} more subjects</p>
            )}
          </div>
        )}

        {/* Empty state */}
        {(!assignments || assignments.length === 0) && (
          <div className="pt-2 pb-1">
            <p className="text-sm text-gray-500 text-center italic">No subjects assigned yet</p>
          </div>
        )}
      </motion.div>

      {showFeeModal && (
        <Modal
          isOpen={showFeeModal}
          onClose={() => setShowFeeModal(false)}
          title={`Assign Fee Category - ${title}`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-secondary-900 mb-2">
                Select Fee Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border border-secondary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Choose a category...</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} - Rs. {cat.total_amount.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
              <p>
                    <strong>Note:</strong> Assigning a new fee category will by default affect only new challans. Check the option below to apply the new category to existing pending/unpaid challans for this class.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="applyExisting"
                type="checkbox"
                checked={applyToExisting}
                onChange={(e) => setApplyToExisting(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="applyExisting" className="text-sm text-secondary-700">Apply to existing pending/unpaid challans</label>
            </div>

            <div className="flex gap-4">
              <Button 
                variant="primary" 
                className="flex-1"
                onClick={handleAssignCategory}
                disabled={loading || !selectedCategory}
              >
                {loading ? 'Assigning...' : 'Assign Category'}
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setShowFeeModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default ClassCard;

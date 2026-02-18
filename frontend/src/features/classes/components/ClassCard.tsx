import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../../../components/Button';
import { Edit2, Trash2, DollarSign } from 'lucide-react';
import Modal from '../../../components/Modal';
import { classAssignmentsApi, feeCategoriesApi } from '../../accountant/services/feeApi';
import logger from '../../../utils/logger';

interface Assignment { subject?: string; teacher?: string; time?: string }
interface Props { 
  id?: string; 
  name?: string; 
  code?: string; 
  capacity?: number; 
  onEdit?: () => void; 
  onDelete?: () => void; 
  assignments?: Assignment[];
  class_name?: string;
  section?: string;
}

const ClassCard: React.FC<Props> = ({ 
  id, name, code, capacity, onEdit, onDelete, assignments = [],
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
        whileHover={{ scale: 1.02, y: -6 }}
        transition={{ duration: 0.25 }}
        onClick={handleCardClick}
        className="group bg-white rounded-lg p-4 shadow-lg border border-transparent hover:border-secondary-200 cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-semibold text-primary-800">{title}</h4>
            <p className="text-sm text-secondary-500">{code ? `${code} • ` : ''}Capacity: {capacity || '—'}</p>

            {assignments && assignments.length > 0 && (
              <div className="mt-3 space-y-2">
                {assignments.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-secondary-700">
                    <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-semibold">{(a.teacher||a.subject||'').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div>
                    <div className="truncate">
                      <div className="font-medium">{a.subject || '—'}</div>
                      <div className="text-sm text-secondary-500">{a.teacher || '—'}{a.time ? ` • ${a.time}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Button 
              variant="success" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); setShowFeeModal(true); }}
              title="Assign Fee Category"
            >
              <DollarSign className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onDelete?.(); }} disabled={!id}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
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

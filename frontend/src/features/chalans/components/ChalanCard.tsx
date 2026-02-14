import React from 'react';
import { motion } from 'framer-motion';
import Button from '../../../components/Button';
import { Edit2, Trash2, Receipt } from 'lucide-react';

interface LineItem {
  label: string;
  amount: number;
}

interface Props {
  id?: string;
  admission_no?: string;
  student_name?: string;
  father_name?: string;
  class_section?: string;
  issue_date?: string;
  due_date?: string;
  line_items?: LineItem[];
  grand_total?: number;
  status?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ChalanCard: React.FC<Props> = ({
  id,
  admission_no,
  student_name,
  class_section,
  due_date,
  line_items = [],
  grand_total = 0,
  status = 'pending',
  onEdit,
  onDelete
}) => {
  const statusColor = status === 'paid' ? 'bg-green-100 text-green-700' : status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -6 }}
      transition={{ duration: 0.25 }}
      className="group bg-white rounded-lg p-4 shadow-lg border border-transparent hover:border-primary-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="w-5 h-5 text-primary-600" />
            <h4 className="font-semibold text-primary-800">{admission_no || 'N/A'}</h4>
            <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>{status}</span>
          </div>
          <p className="text-sm font-medium">{student_name || '—'}</p>
          <p className="text-xs text-secondary-500">{class_section || '—'}</p>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); onDelete?.(); }} disabled={!id}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="border-t pt-3 space-y-1">
        {line_items.slice(0, 3).map((item, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <span className="text-secondary-600">{item.label}</span>
            <span className="font-medium">PKR {item.amount?.toLocaleString()}</span>
          </div>
        ))}
        {line_items.length > 3 && (
          <div className="text-xs text-secondary-500">+ {line_items.length - 3} more items</div>
        )}
      </div>

      <div className="border-t mt-3 pt-3 flex justify-between items-center">
        <span className="font-semibold text-primary-800">Grand Total:</span>
        <span className="text-lg font-bold text-primary-600">PKR {grand_total?.toLocaleString()}</span>
      </div>

      {due_date && (
        <div className="mt-2 text-xs text-secondary-500">
          Due: {new Date(due_date).toLocaleDateString()}
        </div>
      )}
    </motion.div>
  );
};

export default ChalanCard;

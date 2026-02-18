import React, { useState, useEffect } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { Loader2, Plus, X } from 'lucide-react';
import { createChalan, updateChalan } from '../services/chalansApi';
import logger from '../../../utils/logger';

interface LineItem {
  label: string;
  amount: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  chalan?: any;
  onSaved?: () => void;
}

const AddChalanModal: React.FC<Props> = ({ isOpen, onClose, chalan, onSaved }) => {
  const [admissionNo, setAdmissionNo] = useState('');
  const [studentName, setStudentName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [classSection, setClassSection] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ label: '', amount: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (chalan) {
      setAdmissionNo(chalan.admission_no || '');
      setStudentName(chalan.student_name || '');
      setFatherName(chalan.father_name || '');
      setClassSection(chalan.class_section || '');
      setIssueDate(chalan.issue_date || '');
      setDueDate(chalan.due_date || '');
      setStatus(chalan.status || 'pending');
      setLineItems(chalan.line_items && chalan.line_items.length > 0 ? chalan.line_items : [{ label: '', amount: 0 }]);
    } else {
      // Reset for new chalan
      setAdmissionNo('');
      setStudentName('');
      setFatherName('');
      setClassSection('');
      setIssueDate(new Date().toISOString().split('T')[0]);
      setDueDate('');
      setStatus('pending');
      setLineItems([{ label: '', amount: 0 }]);
    }
  }, [chalan, isOpen]);

  if (!isOpen) return null;

  const addLineItem = () => {
    setLineItems([...lineItems, { label: '', amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: 'label' | 'amount', value: string | number) => {
    const updated = [...lineItems];
    if (field === 'amount') {
      updated[index][field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
    } else {
      updated[index][field] = value as string;
    }
    setLineItems(updated);
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!studentName.trim()) {
      setError('Student name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        admission_no: admissionNo.trim(),
        student_name: studentName.trim(),
        father_name: fatherName.trim(),
        class_section: classSection.trim(),
        issue_date: issueDate,
        due_date: dueDate,
        line_items: lineItems.filter(item => item.label.trim() && item.amount > 0),
        status,
      };

      if (chalan && (chalan.id || chalan._id)) {
        await updateChalan(chalan.id || chalan._id, payload);
      } else {
        await createChalan(payload);
      }

      onSaved?.();
      onClose();
    } catch (err: any) {
      logger.error('CHALAN', `Failed to save chalan: ${String(err)}`);
      setError(err?.message || 'Failed to save chalan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={chalan ? 'Edit Chalan' : 'Add New Chalan'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-danger-700 bg-danger-50 p-2 rounded">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Admission No</label>
            <input
              value={admissionNo}
              onChange={(e) => setAdmissionNo(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="6355"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Student Name *</label>
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="Ali Hassan"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Father Name</label>
            <input
              value={fatherName}
              onChange={(e) => setFatherName(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="Bilal Hussain"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Class / Section</label>
            <input
              value={classSection}
              onChange={(e) => setClassSection(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="Nursery-C"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Issue Date</label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Fee Items</h3>
            <Button
              variant="secondary"
              size="sm"
              onClick={(e: any) => {
                e.preventDefault();
                addLineItem();
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          <div className="space-y-2">
            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-7 p-2 border rounded"
                  placeholder="Label (e.g., Tuition Fee)"
                  value={item.label}
                  onChange={(e) => updateLineItem(idx, 'label', e.target.value)}
                />
                <input
                  type="number"
                  className="col-span-4 p-2 border rounded"
                  placeholder="Amount"
                  value={item.amount || ''}
                  onChange={(e) => updateLineItem(idx, 'amount', e.target.value)}
                  min="0"
                  step="0.01"
                />
                <div className="col-span-1 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e: any) => {
                      e.preventDefault();
                      removeLineItem(idx);
                    }}
                    disabled={lineItems.length === 1}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t flex justify-between items-center">
            <span className="font-semibold text-lg">Grand Total:</span>
            <span className="text-2xl font-bold text-primary-600">
              PKR {calculateTotal().toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : chalan ? (
              'Update'
            ) : (
              'Create Chalan'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddChalanModal;

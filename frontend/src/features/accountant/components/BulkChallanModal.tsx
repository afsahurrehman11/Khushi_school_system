import React, { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { challanApi } from '../services/feeApi';
import { InAppNotificationService } from '../services/InAppNotificationService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const BulkChallanModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [classId, setClassId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [studentIdsText, setStudentIdsText] = useState('');
  const [applyToClass, setApplyToClass] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setClassId('');
      setCategoryId('');
      setDueDate(new Date().toISOString().split('T')[0]);
      setStudentIdsText('');
      setApplyToClass(true);
      setLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!categoryId) return InAppNotificationService.error('Select category');
    if (!applyToClass && !studentIdsText.trim()) return InAppNotificationService.error('Provide student IDs or choose apply to class');

    setLoading(true);
    try {
      const payload: any = {
        class_id: classId,
        category_id: categoryId,
        due_date: dueDate,
      };

      if (!applyToClass) {
        // parse student ids from textarea (comma/newline separated)
        const ids = studentIdsText.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
        payload.student_ids = ids;
      }

      const res = await challanApi.createBulkFromCategory(payload as any);
      InAppNotificationService.success(`Created ${res?.created || res?.created?.length || 0} challans`);
      onClose();
    } catch (err) {
      InAppNotificationService.error('Failed to create bulk challans');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Bulk Challans">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-1">Class ID (optional)</label>
          <input value={classId} onChange={e => setClassId(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="Class ID" />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Category ID</label>
          <input value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full px-3 py-2 border rounded" placeholder="Fee Category ID" required />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1">Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-2 border rounded" />
        </div>

        <div className="flex items-center gap-3">
          <input id="applyToClass" type="checkbox" checked={applyToClass} onChange={e => setApplyToClass(e.target.checked)} />
          <label htmlFor="applyToClass" className="text-sm">Apply to all students in class (if class provided)</label>
        </div>

        {!applyToClass && (
          <div>
            <label className="block text-sm font-semibold mb-1">Student IDs (comma or newline separated)</label>
            <textarea value={studentIdsText} onChange={e => setStudentIdsText(e.target.value)} className="w-full px-3 py-2 border rounded" rows={4} />
          </div>
        )}

        <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                  <span>Creating...</span>
                </div>
              ) : 'Create Challans'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
};

export default BulkChallanModal;

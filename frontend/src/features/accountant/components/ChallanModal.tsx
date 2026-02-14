import React, { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { challanApi } from '../services/feeApi';
import { InAppNotificationService } from '../services';
import printChallan from '../utils/printChallan';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  challanId: string | null;
  onSaved?: () => void;
}

const ChallanModal: React.FC<Props> = ({ isOpen, onClose, challanId, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!isOpen || !challanId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const resp = await challanApi.getChalan(challanId);
        if (mounted) setData(resp);
      } catch (err) {
        InAppNotificationService.error('Failed to load challan');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isOpen, challanId]);

  const handleSave = async () => {
    if (!data || !challanId) return;
    setSaving(true);
    try {
      await challanApi.updateChalan(challanId, data);
      InAppNotificationService.success('Challan updated');
      onSaved && onSaved();
      onClose();
    } catch (err) {
      InAppNotificationService.error('Failed to save challan');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={data ? `Challan — ${data.student_name}` : 'Challan'} size="md">
      {loading ? (
        <div className="py-12 text-center">Loading...</div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary-600">Student</label>
              <div className="mt-1 text-secondary-900">{data.student_name} <div className="text-xs text-secondary-500">{data.student_id}</div></div>
            </div>
            <div>
              <label className="block text-sm text-secondary-600">Class</label>
              <input value={data.class_id || ''} onChange={e => setData({ ...data, class_id: e.target.value })} className="mt-1 px-3 py-2 border rounded w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary-600">Category</label>
              <input value={data.category_name || data.category_id || ''} onChange={e => setData({ ...data, category_name: e.target.value })} className="mt-1 px-3 py-2 border rounded w-full" />
            </div>
            <div>
              <label className="block text-sm text-secondary-600">Due Date</label>
              <input type="date" value={data.due_date ? data.due_date.split('T')[0] : ''} onChange={e => setData({ ...data, due_date: e.target.value })} className="mt-1 px-3 py-2 border rounded w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-secondary-600">Amount</label>
              <input type="number" value={data.total_amount || data.amount || 0} onChange={e => setData({ ...data, total_amount: Number(e.target.value) })} className="mt-1 px-3 py-2 border rounded w-full" />
            </div>
            <div>
              <label className="block text-sm text-secondary-600">Status</label>
              <select value={data.status || ''} onChange={e => setData({ ...data, status: e.target.value })} className="mt-1 px-3 py-2 border rounded w-full">
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          <div className="flex justify-between gap-2 mt-4">
            <div>
              <Button variant="ghost" onClick={() => printChallan(data)} disabled={saving}>Print</Button>
            </div>
            <div>
              <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center">No data</div>
      )}
    </Modal>
  );
};

export default ChallanModal;

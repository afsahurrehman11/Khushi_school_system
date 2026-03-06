import React, { useState, useEffect } from 'react';
import { PaymentMethodType, StudentMonthlyFee } from '../../../types';
import studentFeeService from '../../../services/studentFees';
import { authService } from '../../../services/auth';
import { useCashSession } from '../../accountant/hooks/useCashSession';
import { InAppNotificationService } from '../../accountant/services';
import PastPaymentModal from './PastPaymentModal';
import Button from '../../../components/Button';

interface Props {
  studentId: string;
  onRecorded?: () => void;
}

const RecordPaymentTab: React.FC<Props> = ({ studentId, onRecorded }) => {
  const [currentFee, setCurrentFee] = useState<StudentMonthlyFee | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodType>('CASH');
  const [methodName, setMethodName] = useState('');
  const [txRef, setTxRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPastModal, setShowPastModal] = useState(false);

  const { session: cashSession } = useCashSession();

  const loadCurrent = async () => {
    setLoading(true);
    try {
      const fee = await studentFeeService.getCurrentMonthFee(studentId);
      setCurrentFee(fee);
    } catch (e) {
      setCurrentFee(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCurrent(); }, [studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Role check
    const user = authService.getUser();
    const role = user?.role?.toLowerCase();
    if (!(role === 'accountant' || role === 'admin')) {
      InAppNotificationService.error('Only Accountant or Admin can record payments');
      return;
    }

    // Session check
    if (cashSession?.status !== 'active') {
      InAppNotificationService.error('Please activate your accounting session first');
      return;
    }

    if (!currentFee) {
      InAppNotificationService.error('No current fee found for student');
      return;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      InAppNotificationService.error('Enter a valid amount');
      return;
    }

    if (amt > currentFee.remaining_amount) {
      InAppNotificationService.error('Amount exceeds remaining due');
      return;
    }

    setSubmitting(true);
    try {
      const notes = method !== 'CASH' && methodName ? `method_name=${methodName}` : undefined;
      await studentFeeService.createPayment(studentId, currentFee.id, amt, method, txRef || undefined, notes);
      InAppNotificationService.success('Payment recorded');
      setAmount(''); setTxRef(''); setMethodName('');
      await loadCurrent();
      onRecorded?.();
    } catch (err: any) {
      InAppNotificationService.error(err?.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Record Payment (Current Month)</h3>
        {loading ? (
          <div className="text-gray-600">Loading current fee...</div>
        ) : currentFee ? (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-600">Amount</label>
              <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full border rounded px-2 py-2" placeholder={`Max ${currentFee.remaining_amount}`} required />
            </div>
            <div>
              <label className="block text-sm text-gray-600">Method</label>
              <select value={method} onChange={e=>setMethod(e.target.value as PaymentMethodType)} className="w-full border rounded px-2 py-2">
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="ONLINE">Online</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            {method !== 'CASH' && (
              <div>
                <label className="block text-sm text-gray-600">Method Name</label>
                <input value={methodName} onChange={e=>setMethodName(e.target.value)} className="w-full border rounded px-2 py-2" placeholder="Bank/Service name" />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-600">Transaction Ref (optional)</label>
              <input value={txRef} onChange={e=>setTxRef(e.target.value)} className="w-full border rounded px-2 py-2" />
            </div>

            <div className="md:col-span-4 flex justify-end mt-2">
              <Button variant="ghost" onClick={()=>setShowPastModal(true)}>Record Past Payment</Button>
              <Button type="submit" disabled={submitting} className="ml-2">{submitting ? 'Recording...' : 'Record Payment'}</Button>
            </div>
          </form>
        ) : (
          <div className="text-gray-600">No current fee available for this student.</div>
        )}
      </div>

      {showPastModal && (
        <PastPaymentModal studentId={studentId} onClose={() => setShowPastModal(false)} onRecorded={async () => { await loadCurrent(); onRecorded?.(); }} />
      )}
    </div>
  );
};

export default RecordPaymentTab;

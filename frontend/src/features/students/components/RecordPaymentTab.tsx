import React, { useState, useEffect } from 'react';
import { PaymentMethodType, StudentMonthlyFee } from '../../../types';
import studentFeeService from '../../../services/studentFees';
import { paymentsService } from '../../../services/payments';
import { authService } from '../../../services/auth';
import { useCashSession } from '../../accountant/hooks/useCashSession';
import { InAppNotificationService } from '../../accountant/services';
import PastPaymentModal from './PastPaymentModal';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';

interface Props {
  studentId: string;
  onRecorded?: () => void;
}

const RecordPaymentTab: React.FC<Props> = ({ studentId, onRecorded }) => {
  const [currentFee, setCurrentFee] = useState<StudentMonthlyFee | null>(null);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethodType>('CASH');
  const [paymentMethodId, setPaymentMethodId] = useState<string>('');
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
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

  // TASK 11: Load payment methods on mount
  const loadPaymentMethods = async () => {
    try {
      const methods = await paymentsService.getPaymentMethods();
      setPaymentMethods(methods);
      logger.info('RECORD_PAYMENT', `Loaded ${methods.length} payment methods`);
    } catch (error) {
      logger.error('RECORD_PAYMENT', `Failed to load payment methods: ${error}`);
    }
  };

  useEffect(() => { 
    loadCurrent(); 
    loadPaymentMethods();
  }, [studentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    logger.info('RECORD_PAYMENT', `💳 Submitting payment for student ${studentId}`);

    // Role check
    const user = authService.getUser();
    const role = user?.role?.toLowerCase();
    if (!(role === 'accountant' || role === 'admin')) {
      logger.warning('RECORD_PAYMENT', `⚠️ Unauthorized payment attempt by role ${role}`);
      InAppNotificationService.error('Only Accountant or Admin can record payments');
      return;
    }

    // Session check
    if (cashSession?.status !== 'active') {
      logger.warning('RECORD_PAYMENT', `⚠️ Payment blocked - session not active`);
      InAppNotificationService.error('Please activate your accounting session first');
      return;
    }

    if (!currentFee) {
      logger.error('RECORD_PAYMENT', '❌ No current fee found');
      InAppNotificationService.error('No current fee found for student');
      return;
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      logger.error('RECORD_PAYMENT', '❌ Invalid amount entered');
      InAppNotificationService.error('Enter a valid amount');
      return;
    }

    if (amt > currentFee.remaining_amount) {
      logger.warning('RECORD_PAYMENT', `⚠️ Amount ${amt} exceeds remaining ${currentFee.remaining_amount}`);
      InAppNotificationService.error('Amount exceeds remaining due');
      return;
    }

    setSubmitting(true);
    try {
      const notes = method !== 'CASH' && methodName ? `method_name=${methodName}` : undefined;
      // TASK 11: Send payment_method_id
      await studentFeeService.createPayment(
        studentId, 
        currentFee.id, 
        amt, 
        method, 
        txRef || undefined, 
        notes,
        paymentMethodId || undefined
      );
      logger.info('RECORD_PAYMENT', `✅ Payment recorded successfully: ${amt} PKR`);
      InAppNotificationService.success('Payment recorded');
      setAmount(''); setTxRef(''); setMethodName(''); setPaymentMethodId('');
      await loadCurrent();
      onRecorded?.();
      // Notify other components (overview, class lists) that a payment was recorded
      try {
        window.dispatchEvent(new CustomEvent('feeRecorded', { detail: { studentId } }));
      } catch (e) {
        // ignore
      }
    } catch (err: any) {
      logger.error('RECORD_PAYMENT', `❌ Payment failed: ${err?.message}`);
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
              <label className="block text-sm text-gray-600">Payment Method</label>
              <select 
                value={paymentMethodId} 
                onChange={e=>{
                  const selectedMethodId = e.target.value;
                  setPaymentMethodId(selectedMethodId);
                  const selectedMethod = paymentMethods.find(m => m.id === selectedMethodId);
                  if (selectedMethod) {
                    setMethod(selectedMethod.method_type as PaymentMethodType);
                    setMethodName(selectedMethod.method_name || '');
                  }
                }} 
                className="w-full border rounded px-2 py-2"
                required
              >
                <option value="">Select Payment Method</option>
                {paymentMethods.map(pm => (
                  <option key={pm.id} value={pm.id}>
                    {pm.method_name} ({pm.method_type})
                  </option>
                ))}
              </select>
            </div>
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

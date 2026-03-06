import React, { useState } from 'react';
import Button from '../../../components/Button';
import studentFeeService from '../../../services/studentFees';
import { PaymentMethodType } from '../../../types';

interface Props {
  studentId: string;
  onClose: () => void;
  onRecorded?: () => void;
}

const months = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];

const PastPaymentModal: React.FC<Props> = ({ studentId, onClose, onRecorded }) => {
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CASH');
  const [transactionRef, setTransactionRef] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryFindOrCreateMonthlyFee = async (monthNum: number, yearNum: number) => {
    // Try to find existing monthly fee for year
    const resp = await studentFeeService.getMonthlyFees(studentId, yearNum, undefined, 1, 200);
    const found = resp.fees.find(f => f.month === monthNum && f.year === yearNum);
    if (found) return found;
    // create/generate
    return await studentFeeService.generateMonthlyFee(studentId, monthNum, yearNum);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }

    setSubmitting(true);
    try {
      const fee = await tryFindOrCreateMonthlyFee(month, year);
      if (!fee || !fee.id) throw new Error('Failed to obtain monthly fee record');

      await studentFeeService.createPayment(studentId, fee.id, amt, paymentMethod, transactionRef || undefined);

      onRecorded?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record past payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Record Past Payment</h3>
        {error && <div className="mb-3 text-red-600">{error}</div>}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-sm text-gray-600">Month</label>
              <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="w-full border rounded px-2 py-2">
                {months.map((m, idx) => <option key={m} value={idx+1}>{m}</option>)}
              </select>
            </div>
            <div style={{width:120}}>
              <label className="block text-sm text-gray-600">Year</label>
              <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="w-full border rounded px-2 py-2">
                {Array.from({length:6}).map((_,i)=>{
                  const y = now.getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600">Amount</label>
            <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full border rounded px-2 py-2" required />
          </div>

          <div>
            <label className="block text-sm text-gray-600">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethodType)} className="w-full border rounded px-2 py-2">
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="ONLINE">Online</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CARD">Card</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600">Transaction Reference (optional)</label>
            <input type="text" value={transactionRef} onChange={e=>setTransactionRef(e.target.value)} className="w-full border rounded px-2 py-2" />
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Recording...' : 'Record Payment'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PastPaymentModal;

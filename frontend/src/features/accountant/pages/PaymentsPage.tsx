import React, { useEffect, useState } from 'react';
import Button from '../../../components/Button';
import api from '../../../utils/api';

interface Payment {
  id: string;
  fee_id?: string;
  student_id?: string;
  amount: number;
  payment_mode?: string;
  paid_at?: string;
  remarks?: string;
}

const PaymentsPage: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ fee_id: '', student_id: '', amount: '', payment_mode: 'Cash', remarks: '' });

  useEffect(() => { fetchPayments(); }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const data = await api.get('/api/payments');
      setPayments(data);
    } catch (e) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
      await api.post('/api/payments', payload);
      setForm({ fee_id: '', student_id: '', amount: '', payment_mode: 'Cash', remarks: '' });
      fetchPayments();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-secondary-900 mb-4">Payments</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-soft p-6 col-span-1">
            <h2 className="font-semibold mb-4">Record Payment</h2>
            <form onSubmit={submit} className="space-y-3">
              <input value={form.fee_id} onChange={(e) => setForm({ ...form, fee_id: e.target.value })} placeholder="Fee ID" className="w-full p-2 border rounded" />
              <input value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} placeholder="Student ID" className="w-full p-2 border rounded" />
              <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" className="w-full p-2 border rounded" />
              <select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })} className="w-full p-2 border rounded">
                <option>Cash</option>
                <option>Bank</option>
                <option>Online</option>
              </select>
              <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Remarks" className="w-full p-2 border rounded" />
              <Button type="submit">Record</Button>
            </form>
          </div>

          <div className="bg-white rounded-xl shadow-soft p-6 lg:col-span-2">
            <h2 className="font-semibold mb-4">Recent Payments</h2>
            {loading ? <p>Loading...</p> : (
              <div className="overflow-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b"><th className="py-2">ID</th><th>Student</th><th>Amount</th><th>Mode</th><th>Paid At</th></tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="border-b">
                        <td className="py-2">{p.id}</td>
                        <td>{p.student_id}</td>
                        <td>PKR {p.amount.toLocaleString()}</td>
                        <td>{p.payment_mode}</td>
                        <td>{p.paid_at ? new Date(p.paid_at).toLocaleString() : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentsPage;

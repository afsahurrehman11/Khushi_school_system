import React, { useEffect, useState } from 'react';
import { challanApi, feesApi, feeCategoriesApi } from '../services/feeApi';
import Button from '../../../components/Button';
import { InAppNotificationService } from '../services';
import API_BASE_URL from '../../../config';

interface FeeRow {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string;
  fee_category?: string;
  amount: number;
  status: string;
  due_date?: string;
}

const FeeTable: React.FC = () => {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState<'created_at' | 'amount' | 'student_name'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [classes, setClasses] = useState<any[]>([]);
  const [_categories, setCategories] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      // Use search endpoint when query present
      let data: any;
      const params: any = { page, page_size: pageSize, sort_by: sortBy as any, sort_dir: sortDir };
      if (search) params.student_name = search;
      if (statusFilter) params.status = statusFilter;
      if (classFilter) params.class_id = classFilter;

      if (search || statusFilter || classFilter) {
        data = await feesApi.searchFees(params);
      } else {
        data = await feesApi.getFees(params);
      }

      if (data && Array.isArray(data.fees)) {
        setRows(data.fees);
        setTotal(data.count || 0);
      } else if (Array.isArray(data)) {
        // fallback (older API)
        setRows(data);
        setTotal(data.length);
      } else {
        setRows([]);
        setTotal(0);
      }
    } catch (err) {
      InAppNotificationService.error('Failed to load fees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, page]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cls = await fetch(`${API_BASE_URL}/api/classes`, { headers: localStorage.getItem('token') ? { Authorization: `Bearer ${localStorage.getItem('token')}` } : {} }).then(r => r.ok ? r.json() : []);
        const cats = await feeCategoriesApi.getAllCategories().then((r: any) => Array.isArray(r) ? r : (r.categories || []));
        if (mounted) {
          setClasses(Array.isArray(cls) ? cls : []);
          setCategories(Array.isArray(cats) ? cats : []);
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleMarkPaid = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await feesApi.updateFee(id, { status: 'paid', paid_at: new Date().toISOString() });
      InAppNotificationService.success('Marked paid');
      await load();
    } catch (err) {
      InAppNotificationService.error('Failed to mark paid');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleCredit = async (id: string) => {
    // Create a challan or credit action — scaffold: create a zero-due challan
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await challanApi.createFromCategory({ student_id: id, class_id: '', category_id: '', due_date: new Date().toISOString().split('T')[0] });
      InAppNotificationService.success('Credited fees');
      await load();
    } catch (err) {
      InAppNotificationService.error('Failed to credit');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="bg-white rounded shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <input placeholder="Search student or id..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="px-3 py-2 border rounded w-80" />
        <div className="flex gap-2">
          <select value={classFilter} onChange={e => { setClassFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded">
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c._id || c.id || c.class_name} value={c._id || c.id || (c.class_name + (c.section ? ' ' + c.section : ''))}>{c.class_name ? `${c.class_name}${c.section ? ' ' + c.section : ''}` : (c.name || c)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 border rounded">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto">
        {loading ? <div className="py-12 text-center">Loading...</div> : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3 cursor-pointer" onClick={() => { setSortBy('student_name'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>Student</th>
                <th className="py-2 px-3">Class</th>
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3 cursor-pointer" onClick={() => { setSortBy('amount'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>Amount</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 px-3">{r.student_name} <div className="text-sm text-secondary-500">{r.student_id}</div></td>
                  <td className="py-2 px-3">{r.class_id}</td>
                  <td className="py-2 px-3">{r.fee_category}</td>
                  <td className="py-2 px-3">Rs. {r.amount.toLocaleString()}</td>
                  <td className="py-2 px-3">{r.status}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" disabled={loading || !!actionLoading[r.id]}>Edit</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleCredit(r.id)} disabled={loading || !!actionLoading[r.id]}>
                        {actionLoading[r.id] ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-t-transparent border-current rounded-full animate-spin" />
                            <span>Processing</span>
                          </div>
                        ) : 'Credit'}
                      </Button>
                      <Button size="sm" variant="primary" onClick={() => handleMarkPaid(r.id)} disabled={loading || !!actionLoading[r.id]}>
                        {actionLoading[r.id] ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin" />
                            <span>Processing</span>
                          </div>
                        ) : 'Mark Paid'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-secondary-500">Showing {Math.min(total, pageSize)} of {total} rows</div>
          <div className="flex gap-2 items-center">
              <Button onClick={() => setPage(p => Math.max(1, p - 1))} variant="ghost" disabled={loading}>Prev</Button>
              <div className="text-sm text-secondary-600">Page {page} / {Math.max(1, Math.ceil(total / pageSize))}</div>
              <Button onClick={() => setPage(p => p + 1)} variant="ghost" disabled={loading}>Next</Button>
          </div>
      </div>
    </div>
  );
};

export default FeeTable;

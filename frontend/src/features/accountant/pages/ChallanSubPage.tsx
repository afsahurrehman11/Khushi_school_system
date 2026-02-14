import React, { useEffect, useState } from 'react';
import { challanApi, paymentApi, feeCategoriesApi } from '../services/feeApi';
import Button from '../../../components/Button';
import { InAppNotificationService } from '../services';
import ChallanModal from '../components/ChallanModal';
import printChallan from '../utils/printChallan';
import API_BASE_URL from '../../../config';

export const ChallanSubPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [selectedChallan, setSelectedChallan] = useState<string | null>(null);
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ class_id: '', category_id: '', status: '' });
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [classes, setClasses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'created_at' | 'total_amount' | 'student_name'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = async () => {
    setLoading(true);
    try {
      // Query backend with combined filters (AND semantics)
      const params: any = {
        student_name: search || undefined,
        class_id: filters.class_id || undefined,
        category_id: filters.category_id || undefined,
        status: filters.status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
      };

      const data = await challanApi.search(params);
      if (data && Array.isArray(data.challans)) {
        setRows(data.challans);
        setTotal(data.count || 0);
      } else if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
      } else {
        setRows([]);
        setTotal(0);
      }
    } catch (err) {
      InAppNotificationService.error('Failed to load challans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); load(); }, [search, filters, dateFrom, dateTo]);
  useEffect(() => { load(); }, [page, sortBy, sortDir]);

  useEffect(() => {
    // load classes and categories for selects
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this challan?')) return;
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await challanApi.deleteChalan(id);
      InAppNotificationService.success('Deleted');
      await load();
    } catch (err) {
      InAppNotificationService.error('Failed to delete');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleMarkPaid = async (id: string) => {
    setActionLoading(prev => ({ ...prev, [id]: true }));
    try {
      await paymentApi.recordPayment({ challan_id: id, student_id: '', amount_paid: 0, payment_method: 'cash' });
      InAppNotificationService.success('Payment recorded');
      await load();
    } catch (err) {
      InAppNotificationService.error('Failed to record payment');
    } finally {
      setActionLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <>
    <div className="bg-white rounded shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <input placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} className="px-3 py-2 border rounded w-80" />
        <div className="flex gap-2">
          <select value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} className="px-3 py-2 border rounded">
            <option value="">All Status</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <select value={filters.class_id} onChange={e => setFilters(prev => ({ ...prev, class_id: e.target.value }))} className="px-3 py-2 border rounded">
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c._id || c.id || c.class_name} value={c._id || c.id || (c.class_name + (c.section ? ' ' + c.section : ''))}>{c.class_name ? `${c.class_name}${c.section ? ' ' + c.section : ''}` : (c.name || c)}</option>
            ))}
          </select>
          <select value={filters.category_id} onChange={e => setFilters(prev => ({ ...prev, category_id: e.target.value }))} className="px-3 py-2 border rounded">
            <option value="">All Categories</option>
            {categories.map((cat: any) => (
              <option key={cat._id || cat.id} value={cat._id || cat.id}>{cat.name || cat.title || cat}</option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border rounded" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border rounded" />
        </div>
      </div>

      <div className="overflow-auto">
        {loading ? <div className="py-12 text-center">Loading...</div> : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3 cursor-pointer" onClick={() => { setSortBy('student_name'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>Student</th>
                <th className="py-2 px-3">Category</th>
                <th className="py-2 px-3 cursor-pointer" onClick={() => { setSortBy('total_amount'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>Amount</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 px-3">{r.student_name} <div className="text-sm text-secondary-500">{r.student_id}</div></td>
                  <td className="py-2 px-3">{r.category_name || r.category_id}</td>
                  <td className="py-2 px-3">Rs. {r.total_amount?.toLocaleString()}</td>
                  <td className="py-2 px-3">{r.status}</td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" disabled={loading || !!actionLoading[r.id]} onClick={() => { setSelectedChallan(r.id); setShowChallanModal(true); }}>View</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleMarkPaid(r.id)} disabled={loading || !!actionLoading[r.id]}>
                        {actionLoading[r.id] ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-t-transparent border-current rounded-full animate-spin" />
                            <span>Processing</span>
                          </div>
                        ) : 'Mark Paid'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(r.id)} disabled={loading || !!actionLoading[r.id]}>
                        {actionLoading[r.id] ? (
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 border-2 border-t-transparent border-white rounded-full animate-spin" />
                            <span>Working</span>
                          </div>
                        ) : 'Delete'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => printChallan(r)} disabled={loading || !!actionLoading[r.id]}>Print</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-secondary-500">Showing {Math.min(total, pageSize)} of {total} challans</div>
        <div className="flex gap-2 items-center">
          <Button onClick={() => setPage(p => Math.max(1, p - 1))} variant="ghost" disabled={loading}>Prev</Button>
          <div className="text-sm text-secondary-600">Page {page} / {Math.max(1, Math.ceil(total / pageSize))}</div>
          <Button onClick={() => setPage(p => p + 1)} variant="ghost" disabled={loading}>Next</Button>
        </div>
      </div>
    </div>
    <ChallanModal isOpen={showChallanModal} onClose={() => { setShowChallanModal(false); setSelectedChallan(null); }} challanId={selectedChallan} onSaved={() => load()} />
    </>
  );
};

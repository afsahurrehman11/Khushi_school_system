import React, { useMemo, useState } from 'react';
import Button from './Button';

interface AdminListProps<T> {
  items: T[];
  loading?: boolean;
  onRefresh?: () => void;
  onCreate?: () => void;
  pageSize?: number;
  searchFields?: (keyof T)[];
  renderItem: (item: T) => React.ReactNode;
}

function AdminList<T extends Record<string, any>>({
  items,
  loading = false,
  onRefresh,
  onCreate,
  pageSize = 10,
  searchFields = [],
  renderItem,
}: AdminListProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((it) =>
      searchFields.some((f) => String(it[f] ?? '').toLowerCase().includes(q))
    );
  }, [items, query, searchFields]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const goto = (p: number) => setPage(Math.min(Math.max(1, p), totalPages));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input
            placeholder="Search..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="px-3 py-2 border rounded w-64"
          />
          <Button variant="secondary" onClick={() => { setQuery(''); setPage(1); if (onRefresh) onRefresh(); }}>Refresh</Button>
        </div>
        <div className="flex items-center gap-2">
          {onCreate && <Button onClick={onCreate}>Add</Button>}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-secondary-600">No items found.</div>
      ) : (
        <div className="space-y-2">
          {pageItems.map((it, idx) => (
            <div key={(it as any)._id ?? idx}>{renderItem(it)}</div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <div className="text-sm text-secondary-600">Showing {filtered.length} items</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => goto(page - 1)}>Prev</Button>
          <div className="px-3 py-1 border rounded">{page} / {totalPages}</div>
          <Button variant="ghost" onClick={() => goto(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

export default AdminList;

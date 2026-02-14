import React from 'react';

interface TableColumn<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  // optional selection
  selectable?: boolean;
  selectedIds?: Set<string | number>;
  onToggleSelect?: (id: string | number) => void;
}

function Table<T extends Record<string, any>>({ columns, data, onRowClick, selectable = false, selectedIds, onToggleSelect }: TableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-secondary-200 bg-white shadow-soft">
      <table className="min-w-full divide-y divide-secondary-200">
        <thead className="bg-secondary-50">
          <tr>
            {/** selection column */}
            {selectable && (
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    // select all or deselect all based on current selection
                    data.forEach((d: any) => {
                      const id = d.id;
                      const isSelected = !!selectedIds?.has(id);
                      if (checked && !isSelected) {
                        onToggleSelect?.(id);
                      }
                      if (!checked && isSelected) {
                        onToggleSelect?.(id);
                      }
                    });
                  }}
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-6 py-3 text-left text-xs font-semibold text-secondary-700 uppercase tracking-wider"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-secondary-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-12 text-center text-secondary-500">
                No data available
              </td>
            </tr>
          ) : (
            data.map((item, index) => (
              <tr
                key={index}
                onClick={() => onRowClick?.(item)}
                className={`${onRowClick ? 'cursor-pointer hover:bg-secondary-50' : ''} transition-colors`}
              >
                {selectable && (
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-secondary-900">
                    <input
                      type="checkbox"
                      checked={!!selectedIds?.has(item.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect?.(item.id);
                      }}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default Table;

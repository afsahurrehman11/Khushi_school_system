/**
 * Skeleton Loader Components for Dashboard
 * Shows placeholder while data is loading for better UX
 */
import React from 'react';

export const StatCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-100 animate-pulse">
    <div className="flex items-center justify-between mb-2">
      <div className="h-4 bg-secondary-200 rounded w-20"></div>
      <div className="w-8 h-8 bg-secondary-200 rounded-full"></div>
    </div>
    <div className="h-8 bg-secondary-200 rounded w-16 mb-1"></div>
    <div className="h-3 bg-secondary-200 rounded w-24"></div>
  </div>
);

export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 220 }) => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-100 animate-pulse">
    <div className="h-5 bg-secondary-200 rounded w-32 mb-4"></div>
    <div style={{ height: `${height}px` }} className="bg-secondary-100 rounded"></div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-secondary-100 animate-pulse">
    <div className="h-5 bg-secondary-200 rounded w-40 mb-4"></div>
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary-200 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-secondary-200 rounded w-3/4"></div>
            <div className="h-3 bg-secondary-200 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const DashboardSkeleton: React.FC = () => (
  <div className="min-h-screen bg-secondary-50 p-6 space-y-6">
    {/* Header Skeleton */}
    <div className="flex items-center justify-between mb-6">
      <div>
        <div className="h-8 bg-secondary-200 rounded w-48 mb-2 animate-pulse"></div>
        <div className="h-4 bg-secondary-200 rounded w-64 animate-pulse"></div>
      </div>
    </div>

    {/* Stats Cards Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </div>

    {/* Charts Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2">
        <ChartSkeleton height={220} />
      </div>
      <div>
        <ChartSkeleton height={220} />
      </div>
    </div>

    {/* Tables Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <TableSkeleton rows={3} />
      <TableSkeleton rows={3} />
    </div>

    {/* Loading Message */}
    <div className="text-center py-8">
      <div className="inline-flex items-center gap-3 px-6 py-3 bg-white rounded-full shadow-sm border border-secondary-200 animate-pulse">
        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-secondary-600">Loading dashboard data...</span>
      </div>
    </div>
  </div>
);

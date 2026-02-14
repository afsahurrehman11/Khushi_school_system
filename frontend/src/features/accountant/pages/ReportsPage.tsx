import React from 'react';

const ReportsPage: React.FC = () => {
  

  const downloadFeesCSV = () => {
    const url = '/api/reports/fees/csv';
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-secondary-900 mb-4">Reports</h1>
        <div className="bg-white rounded-xl shadow-soft p-6">
          <p className="text-secondary-600 mb-4">Export reports (CSV)</p>
          <button onClick={downloadFeesCSV} className="bg-primary-600 text-white px-4 py-2 rounded-lg">Download Fees CSV</button>
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;

import React, { useState, useEffect } from 'react';
import Button from '../../../components/Button';
import { api } from '../../../utils/api';
import logger from '../../../utils/logger';

interface AccountantDailySummary {
  id: string;
  date: string;
  opening_balance: number;
  collections: { [key: string]: number };
  total_collected: number;
  closing_balance: number;
  verified: boolean;
}

interface AccountantLogoutSummaryProps {
  onVerify: () => void;
  onCancel: () => void;
}

const AccountantLogoutSummary: React.FC<AccountantLogoutSummaryProps> = ({ onVerify, onCancel }) => {
  const [summary, setSummary] = useState<AccountantDailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadTodaySummary();
  }, []);

  const loadTodaySummary = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await api.get(`/api/accountants/daily-summary/${today}`);
      setSummary(response);
    } catch (error) {
      logger.error('ACCOUNTANT', `Failed to load daily summary: ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!summary) return;

    setVerifying(true);
    try {
      await api.post(`/api/accountants/daily-summary/${summary.id}/verify`, {});
      onVerify();
    } catch (error) {
      logger.error('ACCOUNTANT', `Failed to verify summary: ${String(error)}`);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
          <div className="text-center">Loading today's summary...</div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
          <h2 className="text-xl font-semibold mb-4">Daily Summary</h2>
          <p className="text-gray-600 mb-4">No payments recorded today.</p>
          <div className="flex space-x-2">
            <Button onClick={onVerify} className="flex-1">Continue Logout</Button>
            <Button onClick={onCancel} variant="secondary" className="flex-1">Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-lg w-full">
        <h2 className="text-xl font-semibold mb-4">Daily Payment Summary</h2>
        <p className="text-gray-600 mb-4">Date: {summary.date}</p>

        <div className="space-y-3 mb-6">
          <div className="flex justify-between">
            <span>Opening Balance:</span>
            <span>${summary.opening_balance.toFixed(2)}</span>
          </div>

          <div className="border-t pt-3">
            <h3 className="font-medium mb-2">Collections Today:</h3>
            {Object.entries(summary.collections).map(([method, amount]) => (
              <div key={method} className="flex justify-between text-sm">
                <span>{method}:</span>
                <span>${amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between font-medium border-t pt-2 mt-2">
              <span>Total Collected:</span>
              <span>${summary.total_collected.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex justify-between font-semibold border-t pt-3">
            <span>Closing Balance:</span>
            <span>${summary.closing_balance.toFixed(2)}</span>
          </div>
        </div>

        {!summary.verified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
            <p className="text-sm text-yellow-800">
              Please verify that you have collected the above amounts and have them in your possession before logging out.
            </p>
          </div>
        )}

        <div className="flex space-x-2">
          <Button
            onClick={handleVerify}
            disabled={verifying || summary.verified}
            className="flex-1"
          >
            {verifying ? 'Verifying...' : summary.verified ? 'Already Verified' : 'Verify & Logout'}
          </Button>
          <Button onClick={onCancel} variant="secondary" className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AccountantLogoutSummary;
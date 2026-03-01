import React, { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import { InAppNotificationService } from '../services/InAppNotificationService';
import { authService } from '../../../services/auth';
import { config } from '../../../config';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const FeeVoucherSettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [dueDay, setDueDay] = useState<number | ''>('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/fee-voucher-settings`, {
        headers: authService.getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setHeaderText(data.header_text || '');
        setFooterText(data.footer_text || '');
        setDueDay(typeof data.due_day === 'number' ? data.due_day : (data.due_day ? Number(data.due_day) : ''));
      } else {
        // Settings might not exist yet, that's okay
        setHeaderText('');
        setFooterText('');
        setDueDay('');
      }
    } catch (err) {
      console.error('Failed to load voucher settings:', err);
      InAppNotificationService.error('Failed to load voucher settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/fee-voucher-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeaders(),
        },
        body: JSON.stringify({
          header_text: headerText,
          footer_text: footerText,
          due_day: dueDay === '' ? null : Number(dueDay),
        }),
      });

      if (response.ok) {
        InAppNotificationService.success('Voucher settings saved successfully');
        onClose();
      } else {
        let msg = 'Failed to save settings';
        try {
          const errorData = await response.json();
          if (Array.isArray(errorData)) {
            msg = errorData.map((e: any) => {
              if (e.msg) {
                const loc = Array.isArray(e.loc) ? e.loc.join('.') : String(e.loc);
                return loc ? `${loc}: ${e.msg}` : e.msg;
              }
              return JSON.stringify(e);
            }).join('; ');
          } else if (errorData && errorData.detail) {
            msg = String(errorData.detail);
          } else if (errorData && errorData.message) {
            msg = String(errorData.message);
          } else {
            msg = JSON.stringify(errorData);
          }
        } catch (e) {
          // ignore parse errors and keep default message
        }
        InAppNotificationService.error(msg);
      }
    } catch (err) {
      console.error('Failed to save voucher settings:', err);
      InAppNotificationService.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Fee Voucher Settings">
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading settings...</p>
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Header Text
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Enter text to display at the top of voucher (after student details)"
              />
              <p className="mt-1 text-xs text-gray-500">
                This text will appear after the student information section.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Footer Text
              </label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Enter text to display at the bottom of voucher (before stamps)"
              />
              <p className="mt-1 text-xs text-gray-500">
                This text will appear after the fee details, before the stamp area.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monthly Due Day
              </label>
              <input
                type="number"
                min={1}
                max={31}
                className="w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm"
                value={dueDay === '' ? '' : String(dueDay)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '') return setDueDay('');
                  const n = Number(v);
                  if (Number.isNaN(n)) return;
                  setDueDay(Math.max(1, Math.min(31, Math.floor(n))));
                }}
                placeholder="Day (1-31)"
              />
              <p className="mt-1 text-xs text-gray-500">
                Optional. Enter the day of each month when vouchers are due (e.g. 5 for 5th of month).
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default FeeVoucherSettingsModal;

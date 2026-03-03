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
  const [schoolName, setSchoolName] = useState('');
  const [leftImagePreview, setLeftImagePreview] = useState<string | null>(null);
  const [rightImagePreview, setRightImagePreview] = useState<string | null>(null);
  const [leftImageBlob, setLeftImageBlob] = useState<string | null>(null);
  const [rightImageBlob, setRightImageBlob] = useState<string | null>(null);

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
        setSchoolName(data.school_name || '');
        setLeftImagePreview(data.left_image_blob || null);
        setRightImagePreview(data.right_image_blob || null);
        setLeftImageBlob(data.left_image_blob || null);
        setRightImageBlob(data.right_image_blob || null);
      } else {
        // Settings might not exist yet, that's okay
        setHeaderText('');
        setFooterText('');
        setDueDay('');
        setSchoolName('');
        setLeftImagePreview(null);
        setRightImagePreview(null);
        setLeftImageBlob(null);
        setRightImageBlob(null);
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

  const handleImageSelect = async (file: File, side: 'left' | 'right') => {
    console.log(`[FEE_VOUCHER_IMG] 📸 Selecting ${side} image: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        console.log(`[FEE_VOUCHER_IMG] 🔍 ${side} image read complete, result length: ${base64?.length || 0}`);
        if (side === 'left') {
          setLeftImageBlob(base64);
          setLeftImagePreview(base64);
          console.log(`[FEE_VOUCHER_IMG] ✅ Left image state updated`);
        } else {
          setRightImageBlob(base64);
          setRightImagePreview(base64);
          console.log(`[FEE_VOUCHER_IMG] ✅ Right image state updated`);
        }
      };
      reader.onerror = (error) => {
        console.error(`[FEE_VOUCHER_IMG] ❌ Error reading ${side} image:`, error);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(`[FEE_VOUCHER_IMG] ❌ Failed to load ${side} image:`, err);
      InAppNotificationService.error(`Failed to load ${side} image`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    console.log('[FEE_VOUCHER_SAVE] 💾 Preparing to save fee voucher settings...');
    console.log('[FEE_VOUCHER_SAVE] 📋 Settings:', {
      header_text: headerText,
      footer_text: footerText,
      due_day: dueDay,
      school_name: schoolName,
      has_left_image: !!leftImageBlob,
      has_right_image: !!rightImageBlob,
      left_blob_length: leftImageBlob?.length || 0,
      right_blob_length: rightImageBlob?.length || 0,
    });
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
          school_name: schoolName,
          left_image_blob: leftImageBlob,
          right_image_blob: rightImageBlob,
        }),
      });

      console.log(`[FEE_VOUCHER_SAVE] 📡 Response status: ${response.status}`);
      if (response.ok) {
        console.log('[FEE_VOUCHER_SAVE] ✅ Settings saved successfully');
        InAppNotificationService.success('Voucher settings saved successfully');
        onClose();
      } else {
        let msg = 'Failed to save settings';
        try {
          const errorData = await response.json();
          console.error('[FEE_VOUCHER_SAVE] ❌ Error response:', errorData);
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
        console.error('[FEE_VOUCHER_SAVE] ❌ Save failed:', msg);
        InAppNotificationService.error(msg);
      }
    } catch (err) {
      console.error('[FEE_VOUCHER_SAVE] ❌ Failed to save voucher settings:', err);
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
                School Name
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. My School"
              />
              <p className="mt-1 text-xs text-gray-500">
                School name will be displayed on fee vouchers.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Left Image (for voucher columns)
              </label>
              <div className="flex gap-4">
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], 'left')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Upload image to appear on left side of fee voucher (small size).
                  </p>
                </div>
                {leftImagePreview && (
                  <div className="w-24 h-24 border border-gray-300 rounded-md overflow-hidden flex-shrink-0">
                    <img src={leftImagePreview} alt="Left preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Right Image (for voucher columns)
              </label>
              <div className="flex gap-4">
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0], 'right')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Upload image to appear on right side of fee voucher (small size).
                  </p>
                </div>
                {rightImagePreview && (
                  <div className="w-24 h-24 border border-gray-300 rounded-md overflow-hidden flex-shrink-0">
                    <img src={rightImagePreview} alt="Right preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
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

import React, { useState, useEffect } from 'react';
import { Save, AlertCircle } from 'lucide-react';
import { apiCallJSON, api } from '../utils/api';
import logger from '../utils/logger';

interface SchoolSettings {
  school_id?: string;
  school_name: string;
}

const SchoolSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [originalSchoolName, setOriginalSchoolName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Load school info on mount
  useEffect(() => {
    const loadSchoolInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        // Try to fetch school info from fee-voucher-settings which may have school_name
        try {
          logger.info('SCHOOL_SETTINGS', 'Attempting to load fee-voucher-settings...');
          const settings = await apiCallJSON('/fee-voucher-settings');
          logger.info('SCHOOL_SETTINGS', `Fee voucher settings loaded: school_name="${settings?.school_name}", has_blob=${!!settings?.left_image_blob}, blob_len=${settings?.left_image_blob?.length || 0}`);
          
          setSchoolName(settings.school_name || '');
          setOriginalSchoolName(settings.school_name || '');
          
          if (settings.left_image_blob) {
            // Handle both raw base64 and data URL formats
            const blob = settings.left_image_blob;
            const preview = blob.startsWith('data:') ? blob : `data:image/png;base64,${blob}`;
            logger.info('SCHOOL_SETTINGS', `Setting logo preview from settings, blob_len=${blob.length}`);
            setLogoPreview(preview);
          }
          // Successfully loaded from fee-voucher-settings, skip fallback
          return;
        } catch (err) {
          logger.warn('SCHOOL_SETTINGS', `Fee voucher settings load failed: ${String(err)} - trying fallback`);
        }

        // Fallback: try to get from school info endpoint
        logger.info('SCHOOL_SETTINGS', '[FALLBACK] Calling /api/schools/info/current...');
        const schoolResp = await apiCallJSON('/schools/info/current');
        logger.info('SCHOOL_SETTINGS', `[FALLBACK] Received response: ${JSON.stringify(schoolResp)}`);
        logger.info('SCHOOL_SETTINGS', `[FALLBACK] Response keys: ${schoolResp ? Object.keys(schoolResp).join(', ') : 'null'}`);
        
        const nameFromResp = schoolResp?.school_name || schoolResp?.display_name || schoolResp?.name || '';
        logger.info('SCHOOL_SETTINGS', `[FALLBACK] Extracted nameFromResp: "${nameFromResp}" (school_name=${schoolResp?.school_name}, display_name=${schoolResp?.display_name}, name=${schoolResp?.name})`);
        
        if (nameFromResp) {
          logger.info('SCHOOL_SETTINGS', `[FALLBACK] ✅ Setting school name to: "${nameFromResp}"`);
          setSchoolName(nameFromResp);
          setOriginalSchoolName(nameFromResp);
          logger.info('SCHOOL_SETTINGS', `Fallback loaded: school_name="${nameFromResp}", has_blob=${!!schoolResp.left_image_blob}`);
          
          if (schoolResp.left_image_blob) {
            const blob = schoolResp.left_image_blob;
            const preview = blob.startsWith('data:') ? blob : `data:image/png;base64,${blob}`;
            logger.info('SCHOOL_SETTINGS', `[FALLBACK] Setting logo preview, blob_len=${blob.length}`);
            setLogoPreview(preview);
          }
        } else {
          logger.error('SCHOOL_SETTINGS', `[FALLBACK] ❌ No school name found in response`);
          setError('Failed to load school information');
        }
      } catch (_e) {
        logger.error('SCHOOL_SETTINGS', `Failed to load school info: ${String(_e)}`);
        setError('Failed to load school information');
      } finally {
        setLoading(false);
      }
    };

    loadSchoolInfo();
  }, []);

  const handleSave = async () => {
    if (!schoolName.trim()) {
      setError('School name cannot be empty');
      return;
    }

    if (schoolName === originalSchoolName) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Save to fee-voucher-settings
      const payload: any = { school_name: schoolName.trim() };
      // Attach logo if provided as base64
      if (logoPreview) {
        // logoPreview is data:image/...;base64,... format
        let base64 = logoPreview;
        if (logoPreview.startsWith('data:')) {
          // Extract just the base64 part after comma
          base64 = logoPreview.split(',')[1] || '';
        }
        payload.left_image_blob = base64;
        logger.info('SCHOOL_SETTINGS', `Saving logo, base64_len=${base64.length}`);
      }

      logger.info('SCHOOL_SETTINGS', `[SAVE] Posting school_name="${schoolName.trim()}" to /api/fee-voucher-settings`);
      const result = await api.post('fee-voucher-settings', payload);
      logger.info('SCHOOL_SETTINGS', `[SAVE] ✅ Response: ${JSON.stringify(result)}`);

      // Update local preview/state from server response if server returned the blob
      try {
        if (result && result.left_image_blob) {
          // server stores base64 string without data: prefix
          const blob = result.left_image_blob;
          const preview = blob.startsWith('data:') ? blob : `data:image/png;base64,${blob}`;
          logger.info('SCHOOL_SETTINGS', `Server returned logo, setting preview (blob_len=${blob.length})`);
          setLogoPreview(preview);
        } else if (!logoPreview) {
          // If no preview locally and server returned none, clear preview
          logger.info('SCHOOL_SETTINGS', 'No logo in response, clearing preview');
          setLogoPreview(null);
        }
      } catch (e) {
        logger.warn('SCHOOL_SETTINGS', `Could not update logo preview from server response: ${String(e)}`);
      }

      setOriginalSchoolName(schoolName);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      logger.info('SCHOOL_SETTINGS', `School name updated to: ${schoolName}`);
    } catch (err: any) {
      logger.error('SCHOOL_SETTINGS', `Failed to save settings: ${String(err)}`);
      setError(err.message || 'Failed to save school settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (file?: File | null) => {
    if (!file) {
      setLogoPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-secondary-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center h-96">
            <div>
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <p className="mt-4 text-secondary-600">Loading settings...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-secondary-900 mb-2">School Settings</h1>
        <p className="text-secondary-600 mb-8">Manage your school information and settings</p>

        <div className="bg-white rounded-xl shadow-soft p-8">
          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900">Error</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-medium">✓ Settings saved successfully</p>
            </div>
          )}

          {/* School Name Field */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-secondary-700 mb-2">
              School Name
            </label>
            <input
              type="text"
              value={schoolName}
              onChange={(e) => {
                setSchoolName(e.target.value);
                setSuccess(false); // Clear success message when user starts editing
              }}
              placeholder="Enter your school name"
              className="w-full px-4 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all text-base"
            />
            <p className="mt-2 text-sm text-secondary-500">
              This name will be displayed on admission forms and fee vouchers.
            </p>
          </div>

          {/* School Logo Upload */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-secondary-700 mb-3">School Logo</label>
            
            <div className="flex items-start gap-6">
              {/* Upload Section */}
              <div className="flex-1">
                <label className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-50 border-2 border-dashed border-primary-300 rounded-lg cursor-pointer hover:bg-primary-100 hover:border-primary-400 transition-all">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm font-medium text-primary-700">Upload your school logo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleLogoChange(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                <p className="mt-2 text-xs text-secondary-500">PNG, JPG, or GIF up to 5MB. Recommended: 200x200px</p>
              </div>

              {/* Preview Section */}
              {logoPreview && (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-32 h-32 rounded-lg overflow-hidden border-2 border-secondary-200 bg-secondary-50 shadow-sm">
                    <img src={logoPreview} alt="school logo preview" className="w-full h-full object-contain p-2" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="px-3 py-1 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-all"
                    >
                      Remove
                    </button>
                    <label className="px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 cursor-pointer transition-all">
                      Replace
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoChange(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>

          {/* Information Section */}
          <div className="mt-12 pt-8 border-t border-secondary-200">
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">About School Settings</h2>
            <p className="text-secondary-600 text-sm leading-relaxed">
              Your school name is used throughout the system on official documents including admission forms
              and fee vouchers. Make sure to keep it accurate and up to date with your institution's official name.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchoolSettings;

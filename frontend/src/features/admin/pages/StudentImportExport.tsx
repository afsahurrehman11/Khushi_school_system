import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Upload,
  FileSpreadsheet,
  History,
  ArrowLeft,
} from 'lucide-react';
import Button from '../../../components/Button';
import ImportModal from '../../students/components/ImportModal';
import ExportModal from '../../students/components/ExportModal';
import ImportHistoryModal from '../../students/components/ImportHistoryModal';
import { downloadSampleTemplate } from '../../students/services/importExportApi';

const StudentImportExport: React.FC = () => {
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadSampleTemplate();
    } catch (err: any) {
      alert(err.message || 'Failed to download template');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <a
              href="/students"
              className="text-secondary-500 hover:text-secondary-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </a>
            <h1 className="text-3xl font-bold text-secondary-900">
              Student Import & Export
            </h1>
          </div>
          <p className="text-secondary-600 ml-8">
            Bulk import students from Excel files or export current student data
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Download Sample */}
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
            className="bg-white rounded-xl shadow-soft p-6 cursor-pointer border border-secondary-200 hover:border-primary-300 transition-colors"
            onClick={handleDownloadTemplate}
          >
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-6 h-6 text-primary-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-1">
              Download Sample Excel
            </h3>
            <p className="text-sm text-secondary-500">
              Get a structured template with correct column headers and formatting rules
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                size="sm"
                disabled={downloading}
                onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
              >
                <Download className="w-4 h-4" />
                {downloading ? 'Downloading...' : 'Download Template'}
              </Button>
            </div>
          </motion.div>

          {/* Import Students */}
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
            className="bg-white rounded-xl shadow-soft p-6 cursor-pointer border border-secondary-200 hover:border-success-300 transition-colors"
            onClick={() => setImportOpen(true)}
          >
            <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-success-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-1">
              Import Students
            </h3>
            <p className="text-sm text-secondary-500">
              Upload an Excel file to bulk import student records with validation and preview
            </p>
            <div className="mt-4">
              <Button
                variant="success"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setImportOpen(true); }}
              >
                <Upload className="w-4 h-4" />
                Start Import
              </Button>
            </div>
          </motion.div>

          {/* Export Students */}
          <motion.div
            whileHover={{ y: -2, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}
            className="bg-white rounded-xl shadow-soft p-6 cursor-pointer border border-secondary-200 hover:border-warning-300 transition-colors"
            onClick={() => setExportOpen(true)}
          >
            <div className="w-12 h-12 bg-warning-100 rounded-lg flex items-center justify-center mb-4">
              <Download className="w-6 h-6 text-warning-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-1">
              Export Students
            </h3>
            <p className="text-sm text-secondary-500">
              Download student data as an Excel file with optional class and section filters
            </p>
            <div className="mt-4">
              <Button
                variant="warning"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setExportOpen(true); }}
              >
                <Download className="w-4 h-4" />
                Export Data
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Import History Section */}
        <div className="bg-white rounded-xl shadow-soft p-6 border border-secondary-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                <History className="w-5 h-5 text-secondary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Import History</h3>
                <p className="text-sm text-secondary-500">View past import logs and download error reports</p>
              </div>
            </div>
            <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
              View All
            </Button>
          </div>
        </div>

        {/* Modals */}
        <ImportModal
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          onImportComplete={() => {
            // Refresh happens via notification toast
          }}
        />
        <ExportModal
          isOpen={exportOpen}
          onClose={() => setExportOpen(false)}
        />
        <ImportHistoryModal
          isOpen={historyOpen}
          onClose={() => setHistoryOpen(false)}
        />
      </div>
    </div>
  );
};

export default StudentImportExport;

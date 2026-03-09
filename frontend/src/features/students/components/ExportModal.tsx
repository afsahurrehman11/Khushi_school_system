import React, { useState, useEffect } from 'react';
import { Download, Loader2, FileSpreadsheet } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import logger from '../../../utils/logger';
import { exportStudents } from '../services/importExportApi';
import { classesService } from '../../../services/classes';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes?: any[]; // optional preloaded classes (array of class objects)
}

const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, classes }) => {
  const [classFilter, setClassFilter] = useState<string>(''); // class name
  const [sectionFilter, setSectionFilter] = useState<string>(''); // section label (e.g. A)
  const [sectionClassId, setSectionClassId] = useState<string>(''); // actual class id for selected section
  const [classesList, setClassesList] = useState<any[]>([]);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [sectionsOptions, setSectionsOptions] = useState<{ id: string; section?: string }[]>([]);
  const [exportAll, setExportAll] = useState<boolean>(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    logger.info('EXPORT', `📤 Starting export with filters: class=${classFilter}, section=${sectionFilter}`);
    setExporting(true);
    setError(null);
    try {
      if (exportAll) {
        await exportStudents();
      } else {
        // If a specific section was chosen we use its class id; otherwise try to send class name (best-effort)
        if (sectionClassId) {
          await exportStudents(sectionClassId, sectionFilter || undefined);
        } else if (classFilter) {
          // find any class id for this class name
          const found = classesList.find(c => c.name === classFilter);
          await exportStudents(found ? found.id : undefined, sectionFilter || undefined);
        } else {
          await exportStudents();
        }
      }
      logger.info('EXPORT', '✅ Export completed successfully');
      onClose();
    } catch (err: any) {
      logger.error('EXPORT', `❌ Export failed: ${String(err)}`);
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // If caller provided classes via props, use them and skip API call
        if (classes && Array.isArray(classes) && classes.length > 0) {
          const items = classes;
          if (!mounted) return;
          setClassesList(items);
          const names = Array.from(new Set(items.map((c: any) => c.class_name || c.name))).sort();
          setClassNames(names);
          return;
        }

        const res = await classesService.getClasses(1, 1000);
        if (!mounted) return;
        const items = res.items || [];
        setClassesList(items);
        const names = Array.from(new Set(items.map((c: any) => c.class_name || c.name))).sort();
        setClassNames(names);
      } catch (e) {
        logger.error('EXPORT', `Failed to load classes: ${String(e)}`);
        // ensure state is cleared so UI shows empty options gracefully
        if (mounted) {
          setClassesList([]);
          setClassNames([]);
        }
      }
    })();
    return () => { mounted = false; };
  }, [classes]);

  useEffect(() => {
    // populate sections when classFilter (class name) changes
    if (!classFilter) {
      setSectionsOptions([]);
      setSectionFilter('');
      setSectionClassId('');
      return;
    }
    const opts = classesList
      .filter(c => (c.class_name || c.name) === classFilter)
      .map(c => ({ id: c.id || c._id || c._id?.toString?.(), section: c.section || '' }));
    setSectionsOptions(opts);
    // reset selection
    setSectionFilter('');
    setSectionClassId('');
  }, [classFilter, classesList]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Students" size="md">
      <div className="space-y-6">
        <div className="flex items-center gap-4 p-4 bg-primary-50 rounded-xl">
          <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <p className="font-medium text-secondary-900">Excel Export</p>
            <p className="text-sm text-secondary-500">
              Export student data matching the template format
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-4">
          <p className="text-sm font-medium text-secondary-700">Export Options</p>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={exportAll} onChange={() => setExportAll(true)} />
              <span className="text-sm">Export entire school (all students)</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={!exportAll} onChange={() => setExportAll(false)} />
              <span className="text-sm">Export by Class &amp; Section</span>
            </label>
          </div>

          {!exportAll && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary-600 mb-1">Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select class</option>
                  {classNames.map((cn) => <option key={cn} value={cn}>{cn}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-secondary-600 mb-1">Section</label>
                <select
                  value={sectionFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSectionFilter(val);
                    const found = sectionsOptions.find(s => (s.section || '') === val);
                    setSectionClassId(found ? (found.id || '') : '');
                  }}
                  disabled={!classFilter}
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select section</option>
                  {sectionsOptions.map((s) => <option key={s.id} value={s.section || ''}>{s.section || '(Default)'}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm text-danger-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export Students
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ExportModal;

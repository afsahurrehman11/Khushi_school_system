import React, { useRef, useState, useEffect } from 'react';
import Button from './Button';
import Modal from './Modal';
import { Printer, Download } from 'lucide-react';
import logger from '../utils/logger';
import { apiCallJSON } from '../utils/api';

interface AdmissionFormPopupProps {
  isOpen: boolean;
  onClose: () => void;
  student: any; // created student object (fields from form)
  imageUrl?: string | null;
}

const AdmissionFormPopup: React.FC<AdmissionFormPopupProps> = ({ isOpen, onClose, student, imageUrl }) => {
  const printRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [studentFields, setStudentFields] = useState<any>(student || {});
  const [displayClassName, setDisplayClassName] = useState<string | null>(null);
  const [displaySection, setDisplaySection] = useState<string | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  if (!isOpen) return null;

  const openPrintWindow = () => {
    try {
      if (!printRef.current) throw new Error('Print content not available');
      // Ensure images have had a chance to load before copying content to new window
      // best-effort, do not block the print window opening
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      (async () => { try { await waitForImagesToLoad(printRef.current, 800); } catch (_) { /* ignore */ } })();
      const content = printRef.current.innerHTML;
      const newWindow = window.open('', '_blank');
      if (!newWindow) throw new Error('Unable to open print window. Please enable popups.');
      
      const styles = `
        <meta charset="utf-8"/>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { size: A4; margin: 12mm; }
          body {
            font-family: 'Times New Roman', Times, serif;
            font-size: 12px;
            padding: 12mm;
            color: #111;
            background: #fff;
            line-height: 1.4;
          }
          hr { margin: 20px 0; border: none; border-top: 1px solid #ccc; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
          .field-label { font-size: 11px; color: #666; font-weight: 600; margin-bottom: 4px; }
          .field-value { font-size: 13px; color: #333; margin-bottom: 12px; }
          .sig-line { width: 45%; text-align: center; }
          .sig-line-inner { border-top: 1px solid #333; padding-top: 12px; font-size: 12px; }
          img { max-width: 100%; height: auto; }
          /* Print helpers */
          .print-container { width: 210mm; max-width: 794px; box-sizing: border-box; padding: 12mm; background: #fff; color: #000; }
          .page-break { page-break-after: always; break-after: page; }
          .avoid-break { page-break-inside: avoid; break-inside: avoid; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      `;
      
      newWindow.document.write(`<!DOCTYPE html><html><head><title>Admission Form - ${studentFields.full_name || 'Student'}</title>${styles}</head><body>${content}</body></html>`);
      newWindow.document.close();
      
      // Delay print to ensure content is rendered
      setTimeout(() => {
        newWindow.focus();
        newWindow.print();
      }, 500);
    } catch (err: any) {
      logger.error('PRINT', String(err));
      alert('Unable to open print dialog. Please ensure popups are enabled and try again.');
    }
  };

  // Helper: wait for images under a root element to finish loading
  const waitForImagesToLoad = async (root: HTMLElement | null, timeout = 3000) => {
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[];
    if (!imgs.length) return;
    await Promise.race([
      Promise.all(imgs.map(img => new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) return resolve();
        const onLoad = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); resolve(); };
        const onErr = () => { img.removeEventListener('load', onLoad); img.removeEventListener('error', onErr); resolve(); };
        img.addEventListener('load', onLoad);
        img.addEventListener('error', onErr);
      }))),
      new Promise<void>((resolve) => setTimeout(() => resolve(), timeout))
    ] as any);
  };

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.body.appendChild(s);
  });

  const downloadPdf = async () => {
    if (!printRef.current) {
      alert('Unable to generate PDF: Content not found');
      return;
    }
    
    setLoading(true);
      try {
      // Load libraries
        logger.info('PDF', `Preparing PDF capture - reg=${studentFields.registration_number || 'N/A'}, imageUrl=${!!imageUrl}, has_school_logo=${!!studentFields.school_logo}, has_profile_blob=${!!studentFields.profile_image_blob}`);
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

      const html2canvas = (window as any).html2canvas;
      const { jsPDF } = (window as any).jspdf;

      if (!html2canvas) throw new Error('html2canvas library failed to load');
      if (!jsPDF) throw new Error('jsPDF library failed to load');

      const element = printRef.current as HTMLElement;
      
      // Temporarily make element visible for html2canvas
      const originalDisplay = element.style.display;
      element.style.display = 'block';
      const originalParentDisplay = element.parentElement?.style.display;
      if (element.parentElement) element.parentElement.style.display = 'block';

      // Wait for images inside the printable element to load (so html2canvas captures them)

      try {
        await waitForImagesToLoad(element, 3000);
      } catch (e) {
        logger.warn('PDF', `Image load wait timed out: ${String(e)}`);
      }

      try {
        // Capture with proper settings
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
          backgroundColor: '#ffffff',
        });

        // Restore visibility
        element.style.display = originalDisplay;
        if (element.parentElement && originalParentDisplay) element.parentElement.style.display = originalParentDisplay;

        // Validate canvas
        if (canvas.width < 100 || canvas.height < 100) {
          throw new Error('Canvas too small - content may not have rendered properly');
        }

        // Convert to PNG (more reliable than JPEG)
        const imgData = canvas.toDataURL('image/png');
        
        // Validate image data
        if (!imgData || imgData.length < 100 || !imgData.startsWith('data:image')) {
          throw new Error('Invalid image data generated');
        }

        // Create PDF with multiple page support if needed
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 10; // mm margins

        // Calculate image dimensions
        const imgWidth = pageWidth - (margin * 2);

        // Add content to PDF
        // If there are explicit page-break markers, split canvas at those offsets
        const breaks = Array.from(element.querySelectorAll('.page-break')) as HTMLElement[];
        const elementWidth = element.clientWidth || element.scrollWidth || canvas.width;

        const pageHeightPx = Math.floor((pageHeight - (margin * 2)) * (canvas.width / pageWidth));

        const breakPositionsPx = breaks
          .map(b => Math.round((b.offsetTop || 0) * (canvas.width / elementWidth)))
          .filter(v => v > 0 && v < canvas.height);

        // Build segments: from 0 to first break, between breaks, and to end
        const segments: Array<{ start: number; end: number }> = [];
        let last = 0;
        if (breakPositionsPx.length === 0) {
          segments.push({ start: 0, end: canvas.height });
        } else {
          for (const bp of breakPositionsPx) {
            if (bp > last) {
              segments.push({ start: last, end: bp });
              last = bp;
            }
          }
          if (last < canvas.height) segments.push({ start: last, end: canvas.height });
        }

        // For each segment, possibly split into multiple PDF pages if it's taller than a page
        for (let si = 0; si < segments.length; si++) {
          const seg = segments[si];
          let segStart = seg.start;
          const segEnd = seg.end;
          while (segStart < segEnd) {
            const segHeight = Math.min(pageHeightPx, segEnd - segStart);

            // Crop the canvas for this slice
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = canvas.width;
            tmpCanvas.height = segHeight;
            const tctx = tmpCanvas.getContext('2d');
            if (!tctx) throw new Error('Failed to create temporary canvas');
            tctx.drawImage(canvas, 0, segStart, canvas.width, segHeight, 0, 0, canvas.width, segHeight);
            const sliceData = tmpCanvas.toDataURL('image/png');

            const drawWidth = imgWidth;
            const drawHeight = (segHeight * drawWidth) / canvas.width;

            if (si > 0 || segStart > seg.start) pdf.addPage();
            try {
              pdf.addImage(sliceData, 'PNG', margin, margin, drawWidth, drawHeight);
            } catch (addErr) {
              logger.error('PDF', `Failed to add slice to PDF: ${String(addErr)}`);
              throw new Error('Could not add image slice to PDF.');
            }

            segStart += segHeight;
          }
        }

        // Save PDF
        const fileName = `Admission_Form_${studentFields.registration_number || studentFields.student_id || 'Student'}_${new Date().getTime()}.pdf`;
        pdf.save(fileName);
        
        logger.info('PDF', `PDF generated successfully: ${fileName}`);
      } catch (renderError) {
        // Restore visibility on error
        element.style.display = originalDisplay;
        if (element.parentElement && originalParentDisplay) element.parentElement.style.display = originalParentDisplay;
        throw renderError;
      }
    } catch (err: any) {
      logger.error('PDF', `PDF generation failed: ${String(err)}`);
      alert(`Failed to generate PDF: ${err.message || 'Unknown error'}. You can try printing instead.`);
    } finally {
      setLoading(false);
    }
  };

  // keep internal student fields state in sync and fetch full details when modal opens
  useEffect(() => {
    let mounted = true;
    const loadDetails = async () => {
      try {
        // Collect all data, then do a single state update at the end
        const updates: any = { ...(student || {}) };
        logger.info('ADMISSION_POPUP', `Initial student data: id=${student?.id || student?._id}, reg=${student?.registration_number}`);
        
        // Fetch school name and logo from fee-voucher-settings
        try {
          const settings = await apiCallJSON('/fee-voucher-settings');
          if (!mounted) return;
          logger.info('ADMISSION_POPUP', `Settings response: school_name=\"${settings?.school_name}\", has_blob=${!!settings?.left_image_blob}, blob_len=${settings?.left_image_blob?.length || 0}`);
          
          if (settings?.school_name) {
            updates.school_name = settings.school_name;
          }
          if (settings?.left_image_blob) {
            let logo = settings.left_image_blob;
            if (typeof logo === 'string' && !logo.startsWith('data:')) {
              // backend stores raw base64 string; assume png when mime not provided
              logo = `data:image/png;base64,${logo}`;
            }
            updates.school_logo = logo;
            logger.info('ADMISSION_POPUP', `Logo prepared for display: ${logo.substring(0, 50)}...`);
          }
        } catch (err) {
          logger.warn('ADMISSION_POPUP', `Failed to fetch settings: ${String(err)}`);
        }

        // Fallback: if no school name yet, try schools/info/current
        if (!updates.school_name) {
          try {
            logger.info('ADMISSION_POPUP', 'No school name from settings, trying schools/info/current...');
            const schoolInfo = await apiCallJSON('/api/schools/info/current');
            if (!mounted) return;
            logger.info('ADMISSION_POPUP', `School info response: name=\"${schoolInfo?.name}\", has_left_blob=${!!schoolInfo?.left_image_blob}`);
            
            if (schoolInfo?.name) {
              updates.school_name = schoolInfo.name;
            }
            // Also try logo from schools endpoint if not already set
            if (!updates.school_logo && schoolInfo?.left_image_blob) {
              let logo = schoolInfo.left_image_blob;
              if (typeof logo === 'string' && !logo.startsWith('data:')) {
                logo = `data:image/png;base64,${logo}`;
              }
              updates.school_logo = logo;
              logger.info('ADMISSION_POPUP', `Logo from schools endpoint, length=${logo?.length || 0}`);
            }
          } catch (err) {
            logger.warn('ADMISSION_POPUP', `Failed to fetch school info: ${String(err)}`);
          }
        }

        // Fetch full student record to ensure we have registration_number
        let full: any = null;
        if (student && (student.id || student._id)) {
          try {
            const sid = student.id || student._id;
            logger.info('ADMISSION_POPUP', `Fetching full student record for ID: ${sid}`);
            full = await apiCallJSON(`/api/students/${sid}`);
            if (!mounted) return;
            logger.info('ADMISSION_POPUP', `Full student response: registration_number=\"${full?.registration_number}\", has_profile_blob=${!!full?.profile_image_blob}`);

            // Merge full student data BUT preserve the school_name we fetched from settings
            const preservedSchoolName = updates.school_name; // Save it before merge (from settings)
            Object.assign(updates, full);
            if (preservedSchoolName) {
              updates.school_name = preservedSchoolName; // Restore it after merge to prevent overwrite by backend fallback
              logger.info('ADMISSION_POPUP', `✅ Restored school_name from settings after student merge: "${preservedSchoolName}"`);
            }

            // Normalize profile image blob into a data URL for rendering
            if (full?.profile_image_blob) {
              if (typeof full.profile_image_blob === 'string' && full.profile_image_blob.startsWith('data:')) {
                updates.profile_image_blob = full.profile_image_blob;
              } else {
                const mime = full.profile_image_type || 'image/jpeg';
                updates.profile_image_blob = `data:${mime};base64,${full.profile_image_blob}`;
              }
              logger.info('ADMISSION_POPUP', `Profile image normalized, length=${updates.profile_image_blob?.length || 0}`);
            }
          } catch (err) {
            logger.warn('ADMISSION_POPUP', `Failed to fetch full student details: ${String(err)}`);
          }
        }

        // Fetch classes to map class_id -> class_name (use full if available, otherwise passed student)
        try {
          const classes = await apiCallJSON('/api/classes');
          if (!mounted) return;
          const classIdToUse = full?.class_id || full?.class || student?.class || student?.class_id || student?.class_name || full?.class_name || null;
          logger.info('ADMISSION_POPUP', `Class lookup: classIdToUse=${classIdToUse}, available classes=${(classes || []).length}`);
          
          const cls = (classes || []).find((c: any) => {
            const cid = String(c.id || c._id || c.class_id || '');
            const names = [c.class_name, c.name, c.title, c.grade].filter(Boolean).map(String);
            return cid === String(classIdToUse) || names.includes(String(classIdToUse));
          });
          if (cls) {
            logger.info('ADMISSION_POPUP', `Found class: ${cls.class_name || cls.name}`);
            setDisplayClassName(cls.class_name || cls.name || cls.title || null);
            setDisplaySection(cls.section || cls.class_section || full?.section || student?.section || updates.section || null);
          } else {
            logger.warn('ADMISSION_POPUP', `No matching class found for: ${classIdToUse}`);
            setDisplayClassName(full?.class_name || full?.class_id || student?.class_name || student?.class || null);
            setDisplaySection(full?.section || student?.section || updates.section || null);
          }
        } catch (err) {
          // fallback to student values
          logger.warn('ADMISSION_POPUP', `Class fetch error: ${String(err)}`);
          setDisplayClassName(full?.class_name || full?.class_id || student?.class_name || student?.class || null);
          setDisplaySection(full?.section || student?.section || updates.section || null);
        }

        // Apply all updates at once
        logger.info('ADMISSION_POPUP', `Final updates: school_name="${updates.school_name}" (preserved from settings), registration_number="${updates.registration_number}", has_logo=${!!updates.school_logo}, has_profile=${!!updates.profile_image_blob}`);
        setStudentFields(updates);

        // Mark ready when registration number is available
        const regNo = updates.registration_number;
        logger.info('ADMISSION_POPUP', `Registration number check: regNo=\"${regNo}\"`);
        setIsReady(!!regNo);
      } catch (e) {
        logger.error('ADMISSION_POPUP', `Failed to load student details: ${String(e)}`);
      }
    };

    if (isOpen) {
      logger.info('ADMISSION_POPUP', 'Modal opened, loading details...');
      loadDetails();
    }
    return () => { mounted = false; };
  }, [isOpen, student]);

  // No automatic download/print on open - user must choose inside modal

  // keep isReady in sync when registration_number arrives asynchronously
  useEffect(() => {
    setIsReady(!!studentFields?.registration_number);
  }, [studentFields?.registration_number]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Admission Form — ${studentFields.school_name || 'School'}`} size="md">
      <div className="space-y-4">
        {/* Registration Number Banner */}
        {studentFields.registration_number && (
          <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-center">
            <div className="text-sm text-primary-600 font-medium">Registration Number</div>
            <div className="text-2xl font-bold text-primary-700 mt-1">{studentFields.registration_number}</div>
          </div>
        )}
        
        <div className="text-sm text-gray-700">The admission form is ready. You can download it as a PDF or print it now.</div>

        <div className="flex gap-2">
          <Button onClick={downloadPdf} disabled={loading || !isReady}>
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
          <Button variant="secondary" onClick={openPrintWindow} disabled={!isReady}>
            <Printer className="w-4 h-4 mr-2" /> Print PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        {/* Hidden printable content */}
        <div style={{ display: 'none' }}>
          <div ref={printRef} className="print-container" style={{ width: '794px', padding: '28px 32px', background: '#fff', color: '#000', fontFamily: "'Times New Roman', Times, serif", fontSize: 12, lineHeight: 1.4 }}>
            
            {/* ==================== HEADER WITH IMAGE ==================== */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px', gap: 16, marginBottom: 18, paddingBottom: 12, alignItems: 'center', borderBottom: '3px solid #1a3a52' }}>
              {/* Left: School Logo */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
                {studentFields.school_logo ? (
                  <img src={studentFields.school_logo} alt="School Logo" style={{ width: 100, height: 100, objectFit: 'contain', borderRadius: 6 }} />
                ) : (
                  <div style={{ width: 100, height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f8', borderRadius: 6, color: '#1a3a52', fontWeight: 700 }}>
                    S
                  </div>
                )}
              </div>

              {/* Center: School name and details (centered) */}
              <div style={{ textAlign: 'center', paddingLeft: 6, paddingRight: 6 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#1a3a52', lineHeight: 1.05 }}>{studentFields.school_name || 'SCHOOL'}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Student Admission Form</div>
                <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>Academic Year: {studentFields.academic_year || new Date().getFullYear()}</div>

                {/* Registration number box centered under subtitle */}
                <div style={{ marginTop: 12, display: 'inline-block', backgroundColor: '#f3f7fb', border: '1px solid #d0e2f0', padding: '10px 16px', textAlign: 'center', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#153142', letterSpacing: 1 }}>REGISTRATION NUMBER</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#153142', letterSpacing: 1, marginTop: 6 }}>{studentFields.registration_number || studentFields.student_id || 'N/A'}</div>
                </div>
              </div>

              {/* Right: Student Photo (aligned to right margin with padding) */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 8 }}>
                {
                  (imageUrl || studentFields.profile_image_blob) ? (
                    <img
                      src={
                        imageUrl || (typeof studentFields.profile_image_blob === 'string' && studentFields.profile_image_blob.startsWith('data:') ? studentFields.profile_image_blob : `data:image/jpeg;base64,${studentFields.profile_image_blob}`)
                      }
                      alt="Student"
                      style={{ width: 110, height: 140, objectFit: 'cover', border: '2px solid #333', borderRadius: 4 }}
                    />
                  ) : (
                    <div style={{ width: 110, height: 140, background: '#f3f4f6', borderRadius: 4, border: '1px dashed #ddd' }} />
                  )
                }
              </div>
            </div>

            {/* Force page break after header */}
            <div className="page-break" />

            {/* ==================== SECTION 1: STUDENT INFORMATION ==================== */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff', backgroundColor: '#1a3a52', padding: '6px 12px', marginBottom: 12, width: '100%', boxSizing: 'border-box' }}>
                1. STUDENT PERSONAL INFORMATION
              </div>
              
              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Full Name *</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.full_name || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Gender</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.gender || 'Not Specified'}
                  </div>
                </div>
              </div>

              {/* Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Student ID</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.student_id || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Roll Number</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.roll_number || ''}
                  </div>
                </div>
              </div>

              {/* Row 3 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Date of Birth</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.date_of_birth || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Admission Date</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.admission_date || ''}
                  </div>
                </div>
              </div>

              {/* Row 4: Class and Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 20, marginBottom: 0 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Class / Grade *</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {displayClassName || studentFields.class_name || studentFields.class_id || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Section</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {displaySection || studentFields.section || studentFields.class_section || ''}
                  </div>
                </div>
              </div>

            </div>

            {/* Force page break after section 1 */}
            <div className="page-break" />

            {/* ==================== SECTION 2: GUARDIAN/PARENT INFORMATION ==================== */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff', backgroundColor: '#1a3a52', padding: '6px 12px', marginBottom: 12, width: '100%', boxSizing: 'border-box' }}>
                2. GUARDIAN / PARENT INFORMATION
              </div>

              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Father / Guardian Name *</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.guardian_info?.father_name || studentFields.parent_name || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>CNIC / ID</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.guardian_info?.parent_cnic || studentFields.parent_cnic || ''}
                  </div>
                </div>
              </div>

              {/* Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, marginBottom: 0 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Contact Number</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.contact_info?.phone || studentFields.phone || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Email Address</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                    {studentFields.contact_info?.email || studentFields.email || ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Force page break after section 2 */}
            <div className="page-break" />

            {/* ==================== SECTION 3: ADDRESS ==================== */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#fff', backgroundColor: '#1a3a52', padding: '6px 12px', marginBottom: 12, width: '100%', boxSizing: 'border-box' }}>
                3. ADDRESS INFORMATION
              </div>
              <div style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginBottom: 3 }}>Residential Address</div>
                <div style={{ borderBottom: '1px solid #333', paddingBottom: 6, minHeight: 20, fontSize: 13, paddingTop: 2 }}>
                  {studentFields.guardian_info?.address || ''}
                </div>
              </div>
            </div>

            {/* Force page break after section 3 */}
            <div className="page-break" />

            {/* ==================== SECTION 4: SIGNATURES ==================== */}
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 8, minHeight: 32, marginBottom: 8 }}></div>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#1a3a52' }}>Parent / Guardian Signature</div>
                <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>Date: ___________________</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 8, minHeight: 32, marginBottom: 8 }}></div>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: '#1a3a52' }}>Authorized School Official</div>
                <div style={{ fontSize: 9, color: '#666', marginTop: 4 }}>Date: ___________________</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid #ddd', textAlign: 'center', fontSize: 8, color: '#999' }}>
              Generated on {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AdmissionFormPopup;

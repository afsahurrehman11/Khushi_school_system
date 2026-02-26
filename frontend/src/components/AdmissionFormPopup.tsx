import React, { useRef, useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import { Check, Printer, Download } from 'lucide-react';
import logger from '../utils/logger';

interface AdmissionFormPopupProps {
  isOpen: boolean;
  onClose: () => void;
  student: any; // created student object (fields from form)
  imageUrl?: string | null;
}

const AdmissionFormPopup: React.FC<AdmissionFormPopupProps> = ({ isOpen, onClose, student, imageUrl }) => {
  const printRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const openPrintWindow = () => {
    try {
      if (!printRef.current) throw new Error('Print content not available');
      const content = printRef.current.innerHTML;
      const newWindow = window.open('', '_blank');
      if (!newWindow) throw new Error('Unable to open print window. Please enable popups.');
      
      const styles = `
        <meta charset="utf-8"/>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 40px;
            color: #111;
            background: #fff;
            line-height: 1.6;
          }
          hr { margin: 20px 0; border: none; border-top: 1px solid #ccc; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
          .field-label { font-size: 11px; color: #666; font-weight: 600; margin-bottom: 4px; }
          .field-value { font-size: 14px; color: #333; margin-bottom: 12px; }
          .sig-line { width: 45%; text-align: center; }
          .sig-line-inner { border-top: 1px solid #333; padding-top: 12px; font-size: 12px; }
          img { max-width: 100%; height: auto; }
          @media print {
            body { padding: 20px; }
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
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        let yPosition = margin;

        // Add content to PDF
        try {
          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
        } catch (addErr) {
          logger.error('PDF', `Failed to add image to PDF: ${String(addErr)}`);
          throw new Error('Could not add image to PDF. The content may be too complex.');
        }

        // Handle multiple pages if content is tall
        let heightLeft = imgHeight - (pageHeight - (margin * 2));
        while (heightLeft > 0) {
          yPosition = heightLeft - imgHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
          heightLeft -= pageHeight - (margin * 2);
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

  const studentFields = student || {};

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Admission Form" size="md">
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
          <Button onClick={downloadPdf} disabled={loading}>
            <Download className="w-4 h-4 mr-2" /> Download PDF
          </Button>
          <Button variant="secondary" onClick={openPrintWindow}>
            <Printer className="w-4 h-4 mr-2" /> Print PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        {/* Hidden printable content */}
        <div style={{ display: 'none' }}>
          <div ref={printRef} style={{ width: '800px', padding: '20px', background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif', lineHeight: 1.4 }}>
            {/* ==================== HEADER (2 COLUMN: LEFT TEXT, RIGHT IMAGE) ==================== */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: '3px solid #333' }}>
              {/* Left: School Info */}
              <div>
                <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>
                  {studentFields.school_name || 'School Name'}
                </div>
                <div style={{ fontSize: 12, color: '#555', letterSpacing: 0.5, marginBottom: 8 }}>STUDENT ADMISSION FORM</div>
                <div style={{ fontSize: 10, color: '#888' }}>Academic Year: {studentFields.academic_year || new Date().getFullYear()}</div>
                
                {/* Registration Number Box - Compact */}
                <div style={{ backgroundColor: '#f0f4f8', border: '1px solid #1a3a52', padding: '6px 8px', marginTop: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', letterSpacing: 0.5 }}>REG NO:</div>
                  <div style={{ fontSize: 14, fontWeight: 'bold', color: '#1a3a52', marginTop: 2 }}>
                    {studentFields.registration_number || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Right: Student Photo */}
              {imageUrl && (
                <div style={{ textAlign: 'center' }}>
                  <img src={imageUrl} alt="profile" style={{ width: 90, height: 110, objectFit: 'cover', border: '2px solid #333' }} />
                </div>
              )}
            </div>

            {/* ==================== SECTION 1: STUDENT INFORMATION ==================== */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: '#1a3a52', padding: '4px 8px', marginBottom: 8 }}>
                1. STUDENT PERSONAL INFORMATION
              </div>
              
              {/* Row 1: Full Name and Gender */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Full Name *</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.full_name || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Gender</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.gender || ''}
                  </div>
                </div>
              </div>

              {/* Row 2: Student ID and Roll Number */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Student ID</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.student_id || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Roll Number</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.roll_number || ''}
                  </div>
                </div>
              </div>

              {/* Row 3: Date of Birth and Admission Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Date of Birth</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.date_of_birth || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Admission Date</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.admission_date || ''}
                  </div>
                </div>
              </div>

              {/* Row 4: Class and Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 0 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Class / Grade *</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.class_id || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Section</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.section || ''}
                  </div>
                </div>
              </div>
            </div>

            {/* ==================== SECTION 2: GUARDIAN INFORMATION ==================== */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: '#1a3a52', padding: '4px 8px', marginBottom: 8 }}>
                2. GUARDIAN / PARENT INFORMATION
              </div>

              {/* Row 1: Father/Guardian Name and CNIC */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Father / Guardian Name *</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.guardian_info?.father_name || studentFields.parent_name || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>CNIC</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.guardian_info?.parent_cnic || studentFields.parent_cnic || ''}
                  </div>
                </div>
              </div>

              {/* Row 2: Contact Number and Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12, marginBottom: 0 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Contact Number</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.contact_info?.phone || studentFields.phone || ''}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Email Address</div>
                  <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                    {studentFields.contact_info?.email || studentFields.email || ''}
                  </div>
                </div>
              </div>
            </div>

            {/* ==================== SECTION 3: ADDRESS ==================== */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#fff', backgroundColor: '#1a3a52', padding: '4px 8px', marginBottom: 8 }}>
                3. ADDRESS
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 'bold', color: '#1a3a52', marginBottom: 2 }}>Residential Address</div>
                <div style={{ borderBottom: '1px solid #333', paddingBottom: 1, minHeight: 18, fontSize: 12 }}>
                  {studentFields.guardian_info?.address || ''}
                </div>
              </div>
            </div>

            {/* ==================== SECTION 4: SIGNATURES (COMPACT) ==================== */}
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ textAlign: 'center', paddingTop: 8 }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 4, minHeight: 28 }}></div>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginTop: 2 }}>Parent / Guardian</div>
                <div style={{ fontSize: 8, color: '#666', marginTop: 1 }}>Date: ___________</div>
              </div>
              <div style={{ textAlign: 'center', paddingTop: 8 }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 4, minHeight: 28 }}></div>
                <div style={{ fontSize: 10, fontWeight: 'bold', color: '#1a3a52', marginTop: 2 }}>School Official</div>
                <div style={{ fontSize: 8, color: '#666', marginTop: 1 }}>Date: ___________</div>
              </div>
            </div>

            {/* Footer - Compact */}
            <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid #ccc', textAlign: 'center', fontSize: 8, color: '#999' }}>
              <div>Printed on {new Date().toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AdmissionFormPopup;

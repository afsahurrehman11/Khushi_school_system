export default function printChallan(challan: any) {
  const w = window.open('', '_blank', 'noopener,noreferrer');
  if (!w) return;

  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Challan - ${challan?.student_name || ''}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
        .header { display:flex; justify-content:space-between; align-items:center; }
        .title { font-size: 20px; font-weight:700; }
        .meta { margin-top: 8px; }
        table { width:100%; border-collapse: collapse; margin-top: 12px; }
        td, th { padding:8px; border:1px solid #ddd; }
        .right { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="title">Challan</div>
          <div class="meta">Issue Date: ${challan?.issue_date || ''}</div>
        </div>
        <div>
          <div><strong>Student:</strong> ${challan?.student_name || ''}</div>
          <div><strong>ID:</strong> ${challan?.student_id || ''}</div>
          <div><strong>Class:</strong> ${challan?.class_id || ''}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Category</th><th class="right">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${challan?.category_name || challan?.category_id || ''}</td>
            <td class="right">Rs. ${(challan?.total_amount || challan?.amount || 0).toLocaleString()}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th class="right">Rs. ${(challan?.total_amount || challan?.amount || 0).toLocaleString()}</th>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:20px">Status: <strong>${challan?.status || ''}</strong></div>

      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
  </html>
  `;

  w.document.open();
  w.document.write(html);
  w.document.close();
}

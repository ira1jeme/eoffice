import { Response } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
}

function cellValue(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return '';
  return String(v);
}

export function sendAsCsv(res: Response, filename: string, rows: Record<string, unknown>[], columns: ReportColumn[]) {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((r) => columns.map((c) => escape(cellValue(r, c.key))).join(','));
  const csv = [header, ...lines].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
}

export async function sendAsXlsx(
  res: Response,
  filename: string,
  rows: Record<string, unknown>[],
  columns: ReportColumn[],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Report');

  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export function sendAsPdfTable(
  res: Response,
  filename: string,
  title: string,
  rows: Record<string, unknown>[],
  columns: ReportColumn[],
) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

  const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  doc.fontSize(16).text(title, { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(8).fillColor('#666').text(`Generated ${new Date().toLocaleString()}`, { align: 'left' });
  doc.moveDown(1);

  const startX = doc.x;
  let y = doc.y;
  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;

  function drawRow(values: string[], bold: boolean) {
    doc.fontSize(9).fillColor('#000').font(bold ? 'Helvetica-Bold' : 'Helvetica');
    values.forEach((v, i) => {
      doc.text(v, startX + i * colWidth, y, { width: colWidth - 6, ellipsis: true });
    });
    y += 18;
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  }

  drawRow(columns.map((c) => c.header), true);
  doc.moveTo(startX, y - 4).lineTo(doc.page.width - doc.page.margins.right, y - 4).strokeColor('#ccc').stroke();

  rows.forEach((r) => drawRow(columns.map((c) => cellValue(r, c.key)), false));

  doc.end();
}

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { getService } from './database.js';
import { base64, shareFile } from './files.js';
import { t, invoiceStatus } from '../web/js/language.js';
import { money, displayDate } from '../web/js/shared.js';

let font;
export async function invoicePdf(invoice) {
  if (!font) font = fetch('/assets/fonts/DejaVuSans.ttf').then(response => { if (!response.ok) throw new Error('Could not load the PDF font.'); return response.arrayBuffer(); }).then(bytes => base64(new Uint8Array(bytes))).catch(error => { font = undefined; throw error; });
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  doc.addFileToVFS('DejaVuSans.ttf', await font); doc.addFont('DejaVuSans.ttf', 'Invoice', 'normal'); doc.setFont('Invoice');
  const width = doc.internal.pageSize.getWidth(); const height = doc.internal.pageSize.getHeight();
  const left = 17, right = width - 17;
  const write = (value, y, size = 10, color = '#34353a') => {
    doc.setFontSize(size); doc.setTextColor(color);
    const lines = doc.splitTextToSize(String(value || ''), width - 34);
    if (y + lines.length * size * 0.4 > height - 17) { doc.addPage(); y = 20; }
    doc.text(lines, left, y); return y + lines.length * size * 0.4 + 2;
  };
  let y = write(invoice.business_name || t('Your business'), 22, 19, '#075fc5');
  y = write([invoice.business_address, invoice.business_email, invoice.business_phone].filter(Boolean).join(' · '), y, 9);
  y = write(`${t('INVOICE')} ${invoice.invoice_number} · ${invoiceStatus(invoice.status)}`, y + 6, 14);
  y = write(`${t('Invoice date')}: ${displayDate(invoice.invoice_date)}    ${t('Due date')}: ${displayDate(invoice.due_date)}`, y, 9);
  y = write(t('BILL TO'), y + 5, 9, '#65666b');
  y = write([invoice.customer_name, invoice.customer_store, invoice.customer_address, invoice.customer_email, invoice.customer_phone].filter(Boolean).join('\n'), y, 10);
  autoTable(doc, {
    startY: y + 3, margin: { left, right: left, top: 18, bottom: 18 },
    head: [[t('DESCRIPTION'), t('QTY'), t('UNIT PRICE'), t('AMOUNT')]],
    body: invoice.items.map(item => [[item.name, item.sku && 'SKU: ' + item.sku].filter(Boolean).join('\n'), item.quantity, money(item.unit_price_cents), money(item.line_total_cents)]),
    theme: 'striped', styles: { font: 'Invoice', fontStyle: 'normal', fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [7, 95, 197], fontStyle: 'normal' },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 19, halign: 'right' }, 2: { cellWidth: 31, halign: 'right' }, 3: { cellWidth: 33, halign: 'right' } }
  });
  y = doc.lastAutoTable.finalY + 8;
  if (y + 32 > height - 18) { doc.addPage(); y = 22; }
  for (const [label, value] of [[t('Subtotal'), invoice.subtotal_cents], [`${t('Tax')} (${invoice.tax_rate}%)`, invoice.tax_cents], [t('Shipping'), invoice.shipping_cents], [t('Total'), invoice.total_cents]]) {
    doc.setFontSize(label === t('Total') ? 13 : 10); doc.setTextColor('#34353a');
    doc.text(label, right - 77, y); doc.text(money(value), right, y, { align: 'right' }); y += 7;
  }
  if (invoice.notes) y = write(`${t('NOTES')}\n${invoice.notes}`, y + 7, 9);
  if (invoice.invoice_message) y = write(`${t('MESSAGE')}\n${invoice.invoice_message}`, y + 3, 9);
  write(t('Thank you for your business.'), y + 5, 9, '#65666b');
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor('#777777'); doc.text(`${invoice.invoice_number} · ${page}/${pages}`, right, height - 9, { align: 'right' }); }
  return new Uint8Array(doc.output('arraybuffer'));
}
export async function shareInvoice(id) {
  const invoice = await (await getService()).request('/api/invoices/' + id);
  await shareFile(invoice.invoice_number + '.pdf', await invoicePdf(invoice), 'application/pdf');
}

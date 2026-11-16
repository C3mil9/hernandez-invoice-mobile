import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative, getService } from './database.js';
import { currentLanguage, t } from '../web/js/language.js';
import { decimal } from './validation.js';

export function base64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export async function shareFile(name, data, mime) {
  if (isNative()) {
    const options = typeof data === 'string' ? { data, encoding: Encoding.UTF8 } : { data: base64(data) };
    const file = await Filesystem.writeFile({ path: 'exports/' + name, directory: Directory.Cache, recursive: true, ...options });
    await Share.share({ title: name, files: [file.uri], dialogTitle: t('Save or share') });
  } else {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}
export async function exportBackup() {
  const backup = await (await getService()).request('/api/backup');
  await shareFile(`hernandez-${new Date().toISOString().replace(/[:.]/g, '-')}.invoice-backup.json`, JSON.stringify(backup, null, 2), 'application/json');
}

export async function exportCsv(path) {
  const service = await getService();
  const url = new URL(path, 'https://local.invalid');
  const kind = /\/([\w-]+)\.csv$/.exec(url.pathname)?.[1];
  let headers, rows;
  if (kind === 'clients') {
    headers = ['Client', 'Store / company', 'Email', 'Phone', 'Address', 'Notes', 'Status'];
    rows = (await service.request('/api/customers')).map(row => [row.name, row.store, row.email, row.phone, row.address, row.notes, t(row.archived ? 'Archived' : 'Active')]);
  } else if (kind === 'products') {
    headers = ['Product', 'SKU', 'Price', 'Description', 'Status'];
    rows = (await service.request('/api/products')).map(row => [row.name, row.sku, row.price, row.description, t(row.archived ? 'Archived' : 'Active')]);
  } else {
    const year = url.searchParams.get('year'); const month = url.searchParams.get('month');
    const invoices = (await service.request('/api/invoices')).filter(row => row.status !== 'Void' && (!year || row.invoice_date.slice(0, 4) === year) && (!month || Number(row.invoice_date.slice(5, 7)) === Number(month)));
    if (kind === 'sales') {
      headers = ['Invoice', 'Invoice date', 'Client', 'Store / company', 'Status', 'Total'];
      rows = invoices.map(row => [`INV-${String(row.id).padStart(6, '0')}`, row.invoice_date, row.customer_name, row.customer_store, t(row.status), decimal(row.total_cents, 2)]);
    } else if (kind === 'invoice-items') {
      headers = ['Invoice', 'Invoice date', 'Client', 'Item name', 'SKU', 'Quantity', 'Unit price ($)', 'Amount']; rows = [];
      for (const record of invoices) {
        const invoice = await service.request('/api/invoices/' + record.id);
        for (const item of invoice.items) rows.push([invoice.invoice_number, invoice.invoice_date, invoice.customer_name, item.name, item.sku, item.quantity, item.unit_price, decimal(item.line_total_cents, 2)]);
      }
    } else throw new Error('Not found.');
  }
  const cell = value => {
    let result = String(value ?? '');
    if (/^[\s]*[=+\-@\t\r]/.test(result)) result = "'" + result;
    return '"' + result.replaceAll('"', '""') + '"';
  };
  const csv = '\ufeff' + [headers.map(label => t(label)), ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  await shareFile(`hernandez-${kind}-${currentLanguage()}.csv`, csv, 'text/csv;charset=utf-8');
}

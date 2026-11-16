/** Backups contain all records, including archives and invoice snapshots. */
import { date, status, calculate } from './validation.js';
export const TABLES = ['customers', 'products', 'business_settings', 'invoices', 'invoice_items'];
export const BACKUP_FORMAT = 'hernandez-invoice-mobile';
const MAX_ROWS = 200000;

export async function createBackup(db) {
  const tables = {};
  for (const name of TABLES) tables[name] = await db.query(`SELECT * FROM ${name} ORDER BY id`);
  return { format: BACKUP_FORMAT, version: 1, created_at: new Date().toISOString(), tables };
}

export async function validateBackup(db, backup) {
  const invalid = () => { throw new Error('This is not a valid Hernandez Invoice backup.'); };
  if (backup?.format !== BACKUP_FORMAT || backup.version !== 1 || !backup.tables || typeof backup.tables !== 'object') invalid();
  let count = 0;
  for (const table of TABLES) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows)) invalid();
    count += rows.length;
    if (count > MAX_ROWS) throw new Error('This backup is too large to restore on this device.');
    const fields = await db.query(`PRAGMA table_info(${table})`);
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length !== fields.length) invalid();
      for (const field of fields) {
        if (!Object.hasOwn(row, field.name)) invalid();
        const value = row[field.name];
        if (table === 'invoice_items' && field.name === 'product_id' && value === null) continue;
        if (field.type === 'INTEGER') {
          if (!Number.isSafeInteger(value) || value < 0) invalid();
        } else if (typeof value !== 'string' || [...value].length > (['address', 'notes', 'description', 'customer_address', 'business_address', 'invoice_message'].includes(field.name) ? 2000 : 200)) invalid();
      }
      if (row.id < 1 || ids.has(row.id)) invalid();
      ids.add(row.id);
      if ('archived' in row && ![0, 1].includes(row.archived)) invalid();
      if ('price_cents' in row && row.price_cents > 9999999900) invalid();
      if ('name' in row && (!row.name.trim() || [...row.name].length > 200)) invalid();
    }
  }
  if (backup.tables.business_settings.length !== 1 || backup.tables.business_settings[0].id !== 1 || backup.tables.business_settings[0].default_tax_basis_points > 10000) invalid();
  const clients = new Set(backup.tables.customers.map(row => row.id));
  const products = new Set(backup.tables.products.map(row => row.id));
  const invoices = new Map(backup.tables.invoices.map(row => [row.id, row]));
  const grouped = new Map();
  for (const item of backup.tables.invoice_items) {
    if (!invoices.has(item.invoice_id) || (item.product_id !== null && !products.has(item.product_id)) || item.quantity_milli < 1 || item.quantity_milli > 100000000 || item.unit_price_cents > 9999999900) invalid();
    if (!grouped.has(item.invoice_id)) grouped.set(item.invoice_id, []);
    grouped.get(item.invoice_id).push(item);
  }
  for (const invoice of invoices.values()) {
    date(invoice.invoice_date, 'Invoice date'); date(invoice.due_date, 'Due date', false); status(invoice.status);
    if (!clients.has(invoice.customer_id) || (invoice.due_date && invoice.due_date < invoice.invoice_date) || invoice.tax_basis_points > 10000 || invoice.shipping_cents > 9999999900) invalid();
    const items = grouped.get(invoice.id) || [];
    if (!items.length || items.length > 100) invalid();
    const totals = calculate(items, invoice.tax_basis_points, invoice.shipping_cents);
    if (items.some((item, index) => item.line_total_cents !== totals.lines[index]) || invoice.subtotal_cents !== totals.subtotal || invoice.tax_cents !== totals.tax || invoice.total_cents !== totals.total) invalid();
  }
  return Object.fromEntries(TABLES.map(table => [table, backup.tables[table].length]));
}

export async function restoreBackup(db, backup) {
  const counts = await validateBackup(db, backup);
  await db.transaction(async () => {
    for (const table of [...TABLES].reverse()) await db.run(`DELETE FROM ${table}`);
    for (const table of TABLES) {
      const fields = (await db.query(`PRAGMA table_info(${table})`)).map(field => field.name);
      const sql = `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`;
      for (const row of backup.tables[table]) await db.run(sql, fields.map(field => row[field]));
    }
    if ((await db.query('PRAGMA foreign_key_check')).length) throw new Error('Backup contains broken record references.');
  });
  return { ok: true, counts };
}

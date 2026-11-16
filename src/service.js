/** Local replacement for the desktop HTTP API. No business data leaves this device. */
import { SCHEMA, SCHEMA_VERSION } from './schema.js';
import { text, money, quantity, taxRate, decimal, date, id, status, calculate } from './validation.js';
import { createBackup, restoreBackup } from './backup.js';

export class InvoiceService {
  constructor(database) { this.db = database; this.queue = Promise.resolve(); }
  async initialize() {
    const version = (await this.db.query('PRAGMA user_version'))[0].user_version;
    if (version > SCHEMA_VERSION) throw new Error('This database needs a newer version of the app.');
    await this.db.execute('PRAGMA foreign_keys=ON;' + SCHEMA + `; PRAGMA user_version=${SCHEMA_VERSION};`);
  }
  // A single queue prevents an asynchronous write from interleaving with a transaction.
  request(path, options = {}) {
    const work = this.queue.then(() => this.dispatch(path, options));
    this.queue = work.catch(() => {});
    return work;
  }
  async dispatch(path, { method = 'GET', body = {} } = {}) {
    const url = new URL(path, 'https://local.invalid');
    const route = url.pathname;
    if (typeof body === 'string') body = JSON.parse(body);
    if (route === '/api/backup' && method === 'GET') return createBackup(this.db);
    if (route === '/api/restore' && method === 'POST') return restoreBackup(this.db, body);
    if (route === '/api/settings') {
      if (method === 'GET') {
        const row = (await this.db.query('SELECT * FROM business_settings WHERE id=1'))[0];
        return { ...row, default_tax_rate: decimal(row.default_tax_basis_points, 2) };
      }
      if (method === 'PUT') {
        const values = ['business_name', 'email', 'phone', 'address', 'invoice_message'].map(field => text(body[field], field.replaceAll('_', ' '), false, ['address', 'invoice_message'].includes(field) ? 2000 : 200));
        await this.db.run('UPDATE business_settings SET business_name=?,email=?,phone=?,address=?,invoice_message=?,default_tax_basis_points=? WHERE id=1', [...values, taxRate(body.default_tax_rate ?? '0')]);
        return { ok: true };
      }
    }
    if (route === '/api/reports' && method === 'GET') return this.report(url.searchParams);
    const match = /^\/api\/(customers|products|invoices)(?:\/(\d+)(?:\/(restore|status))?)?$/.exec(route);
    if (!match) throw new Error('Not found.');
    const [, type, rawId, action] = match;
    const recordId = rawId ? id(rawId, type) : null;
    if (type === 'invoices') {
      if (method === 'GET' && !recordId) return this.db.query('SELECT id,invoice_date,due_date,status,customer_name,customer_store,total_cents FROM invoices ORDER BY invoice_date DESC,id DESC');
      if (method === 'GET' && recordId) return this.getInvoice(recordId);
      if (method === 'POST' && action === 'status') {
        const result = await this.db.run('UPDATE invoices SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?', [status(body.status), recordId]);
        if (!result.changes) throw new Error('Invoice not found.');
        return { ok: true };
      }
      if ((method === 'POST' && !recordId) || (method === 'PUT' && recordId && !action)) return { id: await this.saveInvoice(body, recordId) };
    } else {
      const label = type === 'customers' ? 'Client' : 'Product';
      if (method === 'GET' && !recordId) {
        const rows = await this.db.query(`SELECT * FROM ${type} ORDER BY archived,name COLLATE NOCASE,id`);
        return type === 'products' ? rows.map(row => ({ ...row, price: decimal(row.price_cents, 2) })) : rows;
      }
      if (recordId && (method === 'DELETE' || (method === 'POST' && action === 'restore'))) {
        const result = await this.db.run(`UPDATE ${type} SET archived=? WHERE id=?`, [method === 'DELETE' ? 1 : 0, recordId]);
        if (!result.changes) throw new Error(`${label} not found.`);
        return { ok: true };
      }
      if ((method === 'POST' && !recordId) || (method === 'PUT' && recordId && !action)) {
        const fields = type === 'customers' ? ['name', 'store', 'email', 'phone', 'address', 'notes'] : ['name', 'sku', 'price_cents', 'description'];
        const values = fields.map(field => field === 'price_cents' ? money(body.price, 'Price') : text(body[field], field === 'name' ? `${label} name` : field, field === 'name', ['address', 'notes', 'description'].includes(field) ? 2000 : field === 'sku' ? 100 : 200));
        const result = recordId
          ? await this.db.run(`UPDATE ${type} SET ${fields.map(field => field + '=?').join(',')} WHERE id=?`, [...values, recordId])
          : await this.db.run(`INSERT INTO ${type} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values);
        if (recordId && !result.changes) throw new Error(`${label} not found.`);
        return { id: recordId || result.lastId };
      }
    }
    throw new Error('Not found.');
  }

  async getInvoice(recordId) {
    const row = (await this.db.query('SELECT * FROM invoices WHERE id=?', [recordId]))[0];
    if (!row) throw new Error('Invoice not found.');
    const items = await this.db.query('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id', [recordId]);
    return { ...row, invoice_number: `INV-${String(recordId).padStart(6, '0')}`, tax_rate: decimal(row.tax_basis_points, 2), shipping: decimal(row.shipping_cents, 2), items: items.map(item => ({ ...item, quantity: decimal(item.quantity_milli, 3).replace(/\.?0+$/, ''), unit_price: decimal(item.unit_price_cents, 2) })) };
  }

  async saveInvoice(data, recordId) {
    const customerId = id(data.customer_id, 'client');
    const invoiceDate = date(data.invoice_date, 'Invoice date');
    const dueDate = date(data.due_date, 'Due date', false);
    if (dueDate && dueDate < invoiceDate) throw new Error('Due date cannot be before the invoice date.');
    const invoiceStatus = status(data.status ?? 'Unpaid');
    const notes = text(data.notes, 'Notes', false, 2000);
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw new Error('Add between 1 and 100 invoice items.');
    const items = data.items.map(item => {
      if (!item || typeof item !== 'object') throw new Error('Each invoice item must be valid.');
      return { product_id: item.product_id == null || item.product_id === '' ? null : id(item.product_id, 'product'), name: text(item.name, 'Item name', true, 200), sku: text(item.sku, 'SKU', false, 100), quantity_milli: quantity(item.quantity), unit_price_cents: money(item.unit_price, 'Unit price') };
    });
    const rate = taxRate(data.tax_rate ?? '0');
    const shipping = money(data.shipping ?? '0', 'Shipping');
    const totals = calculate(items, rate, shipping);
    return this.db.transaction(async () => {
      const old = recordId ? (await this.db.query('SELECT * FROM invoices WHERE id=?', [recordId]))[0] : null;
      if (recordId && !old) throw new Error('Invoice not found.');
      const client = (await this.db.query('SELECT * FROM customers WHERE id=?', [customerId]))[0];
      if (!client || (client.archived && old?.customer_id !== customerId)) throw new Error('Select an active client.');
      const previousProducts = old ? new Set((await this.db.query('SELECT product_id FROM invoice_items WHERE invoice_id=?', [recordId])).map(row => row.product_id)) : new Set();
      for (const item of items) if (item.product_id != null) {
        const product = (await this.db.query('SELECT archived FROM products WHERE id=?', [item.product_id]))[0];
        if (!product || (product.archived && !previousProducts.has(item.product_id))) throw new Error('One of the selected products is no longer active.');
      }
      const clientValues = ['name', 'store', 'email', 'phone', 'address'].map(field => old?.customer_id === customerId ? old['customer_' + field] : client[field]);
      const business = old || (await this.db.query('SELECT * FROM business_settings WHERE id=1'))[0];
      const businessValues = old ? ['business_name', 'business_email', 'business_phone', 'business_address', 'invoice_message'].map(field => old[field]) : ['business_name', 'email', 'phone', 'address', 'invoice_message'].map(field => business[field]);
      const columns = ['invoice_date', 'due_date', 'status', 'customer_id', 'customer_name', 'customer_store', 'customer_email', 'customer_phone', 'customer_address', 'business_name', 'business_email', 'business_phone', 'business_address', 'invoice_message', 'subtotal_cents', 'tax_basis_points', 'tax_cents', 'shipping_cents', 'total_cents', 'notes'];
      const values = [invoiceDate, dueDate, invoiceStatus, customerId, ...clientValues, ...businessValues, totals.subtotal, rate, totals.tax, shipping, totals.total, notes];
      if (old) {
        await this.db.run(`UPDATE invoices SET ${columns.map(column => column + '=?').join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`, [...values, recordId]);
        await this.db.run('DELETE FROM invoice_items WHERE invoice_id=?', [recordId]);
      } else {
        recordId = (await this.db.run(`INSERT INTO invoices (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values)).lastId;
      }
      for (const [index, item] of items.entries()) await this.db.run('INSERT INTO invoice_items (invoice_id,product_id,name,sku,quantity_milli,unit_price_cents,line_total_cents) VALUES (?,?,?,?,?,?,?)', [recordId, item.product_id, item.name, item.sku, item.quantity_milli, item.unit_price_cents, totals.lines[index]]);
      return recordId;
    });
  }

  async report(params) {
    const today = new Date();
    const year = Number(params.get('year') ?? today.getFullYear());
    const month = Number(params.get('month') ?? today.getMonth() + 1);
    if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a valid year and month.');
    const rows = await this.db.query("SELECT CAST(substr(invoice_date,6,2) AS INTEGER) AS month,COUNT(*) AS invoice_count,SUM(total_cents) AS total_cents,SUM(CASE WHEN status='Paid' THEN total_cents ELSE 0 END) AS paid_cents,SUM(CASE WHEN status='Unpaid' THEN total_cents ELSE 0 END) AS unpaid_cents FROM invoices WHERE substr(invoice_date,1,4)=? AND status!='Void' GROUP BY substr(invoice_date,6,2)", [String(year)]);
    const months = Array.from({ length: 12 }, (_, index) => rows.find(row => row.month === index + 1) || { month: index + 1, invoice_count: 0, total_cents: 0, paid_cents: 0, unpaid_cents: 0 });
    const yearly = Object.fromEntries(['invoice_count', 'total_cents', 'paid_cents', 'unpaid_cents'].map(key => [key, months.reduce((sum, row) => sum + row[key], 0)]));
    const invoices = await this.db.query("SELECT id,invoice_date,status,customer_name,total_cents FROM invoices WHERE substr(invoice_date,1,7)=? AND status!='Void' ORDER BY invoice_date DESC,id DESC", [`${year}-${String(month).padStart(2, '0')}`]);
    return { year, month, months, yearly, selected_month: months[month - 1], invoices };
  }
}

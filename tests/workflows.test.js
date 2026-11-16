import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { InvoiceService } from '../src/service.js';
import { calculate, money, quantity, taxRate } from '../src/validation.js';

async function app() {
  const sqlite = new DatabaseSync(':memory:');
  const db = {
    async query(sql, values = []) { return sqlite.prepare(sql).all(...values).map(row => ({ ...row })); },
    async execute(sql) { sqlite.exec(sql); },
    async run(sql, values = []) { const result = sqlite.prepare(sql).run(...values); return { changes: Number(result.changes), lastId: Number(result.lastInsertRowid) }; },
    async transaction(operation) { sqlite.exec('BEGIN'); try { const result = await operation(); sqlite.exec('COMMIT'); return result; } catch (error) { sqlite.exec('ROLLBACK'); throw error; } }
  };
  const service = new InvoiceService(db); await service.initialize();
  return service;
}
async function seed(service) {
  const client = await service.request('/api/customers', { method: 'POST', body: { name: 'María Hernández', email: 'maria@example.test' } });
  const product = await service.request('/api/products', { method: 'POST', body: { name: 'Café', price: '19.95', sku: 'CAF-1' } });
  await service.request('/api/settings', { method: 'PUT', body: { business_name: 'Hernandez', default_tax_rate: '8.25' } });
  const data = { customer_id: client.id, invoice_date: '2026-11-14', due_date: '', status: 'Unpaid', tax_rate: '8.25', shipping: '5.00', items: [{ product_id: product.id, name: 'Café', sku: 'CAF-1', quantity: '2.5', unit_price: '19.95' }] };
  const invoice = await service.request('/api/invoices', { method: 'POST', body: data });
  return { client, product, invoice, data };
}

test('money uses half-up line and tax rounding, including values beyond exact float multiplication', () => {
  assert.equal(money('19.95', 'Price'), 1995);
  assert.equal(quantity('2.500'), 2500);
  const result = calculate([{ quantity_milli: 2500, unit_price_cents: 1995 }], taxRate('8.25'), 500);
  assert.deepEqual(result, { lines: [4988], subtotal: 4988, tax: 412, total: 5900 });
  assert.equal(calculate([{ quantity_milli: 1, unit_price_cents: 500 }], 10000, 0).total, 2);
  assert.throws(() => money('1.001', 'Price'));
  assert.throws(() => quantity('0'));
  assert.throws(() => taxRate('100.01'));
  assert.throws(() => money('Infinity', 'Price'));
});

test('create, load and edit invoices preserve original business and customer snapshots', async () => {
  const service = await app(); const { client, invoice, data } = await seed(service);
  const saved = await service.request('/api/invoices/' + invoice.id);
  assert.equal(saved.total_cents, 5900); assert.equal(saved.items[0].quantity, '2.5');
  await service.request('/api/customers/' + client.id, { method: 'PUT', body: { name: 'New client name' } });
  await service.request('/api/settings', { method: 'PUT', body: { business_name: 'New business' } });
  await service.request('/api/invoices/' + invoice.id, { method: 'PUT', body: { ...data, shipping: '6.00' } });
  const updated = await service.request('/api/invoices/' + invoice.id);
  assert.equal(updated.customer_name, 'María Hernández'); assert.equal(updated.business_name, 'Hernandez'); assert.equal(updated.total_cents, 6000);
  const other = await service.request('/api/customers', { method: 'POST', body: { name: 'Other client' } });
  await service.request('/api/invoices/' + invoice.id, { method: 'PUT', body: { ...data, customer_id: other.id } });
  assert.equal((await service.request('/api/invoices/' + invoice.id)).customer_name, 'Other client');
});

test('archived records stay editable on existing invoices and are rejected on new ones', async () => {
  const service = await app(); const { client, product, invoice, data } = await seed(service);
  await service.request('/api/customers/' + client.id, { method: 'DELETE' });
  await service.request('/api/products/' + product.id, { method: 'DELETE' });
  await service.request('/api/invoices/' + invoice.id, { method: 'PUT', body: data });
  await assert.rejects(service.request('/api/invoices', { method: 'POST', body: data }), /active client/);
  await service.request('/api/customers/' + client.id + '/restore', { method: 'POST' });
  await assert.rejects(service.request('/api/invoices', { method: 'POST', body: data }), /no longer active/);
  assert.equal((await service.request('/api/invoices')).length, 1);
});

test('invalid writes do not partially replace invoice items', async () => {
  const service = await app(); const { invoice, data } = await seed(service);
  const original = await service.request('/api/invoices/' + invoice.id);
  await assert.rejects(service.request('/api/invoices/' + invoice.id, { method: 'PUT', body: { ...data, items: [{ ...data.items[0], product_id: 999 }] } }));
  assert.deepEqual(await service.request('/api/invoices/' + invoice.id), original);
  await assert.rejects(service.request('/api/invoices', { method: 'POST', body: { ...data, invoice_date: '2026-02-30' } }));
  await assert.rejects(service.request('/api/invoices', { method: 'POST', body: { ...data, due_date: '2026-01-01' } }));
});

test('reports include paid/unpaid and exclude void invoices by invoice month', async () => {
  const service = await app(); const { invoice, data } = await seed(service);
  await service.request('/api/invoices', { method: 'POST', body: { ...data, status: 'Paid' } });
  await service.request('/api/invoices', { method: 'POST', body: { ...data, status: 'Void' } });
  let report = await service.request('/api/reports?year=2026&month=11');
  assert.equal(report.months.length, 12); assert.equal(report.yearly.total_cents, 11800); assert.equal(report.yearly.paid_cents, 5900); assert.equal(report.yearly.unpaid_cents, 5900);
  await service.request(`/api/invoices/${invoice.id}/status`, { method: 'POST', body: { status: 'Paid' } });
  report = await service.request('/api/reports?year=2026&month=11');
  assert.equal(report.yearly.paid_cents, 11800); assert.equal(report.invoices.length, 2);
  await assert.rejects(service.request('/api/reports?year=2026&month=13'));
});

test('backup round trip preserves all snapshots, IDs, archived records and settings', async () => {
  const original = await app(); const { product } = await seed(original);
  await original.request('/api/products/' + product.id, { method: 'DELETE' });
  const backup = await original.request('/api/backup');
  const restored = await app(); await seed(restored);
  const result = await restored.request('/api/restore', { method: 'POST', body: JSON.parse(JSON.stringify(backup)) });
  assert.equal(result.counts.invoices, 1);
  assert.deepEqual((await restored.request('/api/backup')).tables, backup.tables);
  assert.equal((await restored.request('/api/customers', { method: 'POST', body: { name: 'Next' } })).id, 2);
});

test('corrupt backup totals, duplicate IDs, missing fields and broken references are rejected without deleting records', async () => {
  const service = await app(); await seed(service); const backup = await service.request('/api/backup');
  for (const damage of [b => b.tables.invoices[0].total_cents++, b => b.tables.customers.push(b.tables.customers[0]), b => delete b.tables.products[0].name, b => b.tables.invoice_items[0].product_id = 999, b => b.tables.invoices[0].tax_cents = 1.5, b => b.version = 2]) {
    const invalid = structuredClone(backup); damage(invalid);
    await assert.rejects(service.request('/api/restore', { method: 'POST', body: invalid }));
    assert.deepEqual((await service.request('/api/backup')).tables, backup.tables);
  }
});

test('storage failure during restore rolls back every deleted and inserted record', async () => {
  const service = await app(); await seed(service); const original = await service.request('/api/backup');
  const incoming = structuredClone(original); incoming.tables.customers[0].name = 'Incoming';
  const realRun = service.db.run;
  service.db.run = async (sql, values) => { if (sql.startsWith('INSERT INTO invoice_items')) throw new Error('Disk full'); return realRun(sql, values); };
  await assert.rejects(service.request('/api/restore', { method: 'POST', body: incoming }), /Disk full/);
  service.db.run = realRun;
  assert.deepEqual((await service.request('/api/backup')).tables, original.tables);
});

test('a rejected operation does not block subsequent saves or allow SQL input to become code', async () => {
  const service = await app();
  await assert.rejects(service.request('/api/products', { method: 'POST', body: { name: '', price: '1' } }));
  const name = "Client'); DROP TABLE customers;--";
  await service.request('/api/customers', { method: 'POST', body: { name } });
  assert.equal((await service.request('/api/customers'))[0].name, name);
  await service.request('/api/products', { method: 'POST', body: { name: 'Valid', price: '1.00' } });
  assert.equal((await service.request('/api/products')).length, 1);
});

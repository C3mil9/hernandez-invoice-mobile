import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { openBrowserDatabase } from '../src/browser_database.js';
import { InvoiceService } from '../src/service.js';

test('development preview persists SQLite across reopen and keeps foreign keys enabled', async () => {
  const wasmBinary = await readFile(new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url));
  const db = await openBrowserDatabase({ wasmBinary });
  const service = new InvoiceService(db); await service.initialize();
  await service.request('/api/customers', { method: 'POST', body: { name: 'Saved without a backend' } });
  assert.equal((await db.query('PRAGMA foreign_keys'))[0].foreign_keys, 1);
  await assert.rejects(db.run("INSERT INTO invoice_items (invoice_id,product_id,name,sku,quantity_milli,unit_price_cents,line_total_cents) VALUES (999,NULL,'Missing parent','',1000,100,100)"), /FOREIGN KEY/);
  const reopened = await openBrowserDatabase({ wasmBinary });
  assert.equal((await reopened.query('SELECT name FROM customers'))[0].name, 'Saved without a backend');
  const original = await service.request('/api/backup');
  await assert.rejects(db.transaction(async () => { await db.run('DELETE FROM customers'); throw new Error('Interrupted restore'); }));
  assert.deepEqual((await service.request('/api/backup')).tables, original.tables);
});

import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { InvoiceService } from './service.js';

let ready;
export function getService() {
  if (!ready) ready = open().catch(error => { ready = undefined; throw error; });
  return ready;
}
async function open() {
  let driver;
  if (Capacitor.isNativePlatform()) {
    const manager = new SQLiteConnection(CapacitorSQLite);
    const database = await manager.createConnection('hernandez_invoice', false, 'no-encryption', 1, false);
    await database.open();
    driver = {
      async query(sql, values = []) { return (await database.query(sql, values)).values || []; },
      async execute(sql) { await database.execute(sql, false); },
      async run(sql, values = []) {
        const result = await database.run(sql, values, false);
        return { changes: result.changes?.changes || 0, lastId: result.changes?.lastId };
      },
      async transaction(operation) {
        await database.beginTransaction();
        try { const result = await operation(); await database.commitTransaction(); return result; }
        catch (error) { await database.rollbackTransaction(); throw error; }
      }
    };
  } else {
    // This fallback is for the desktop development preview, not native phone storage.
    const { openBrowserDatabase } = await import('./browser_database.js');
    driver = await openBrowserDatabase();
  }
  const service = new InvoiceService(driver);
  await service.initialize();
  return service;
}
export const isNative = () => Capacitor.isNativePlatform();

import initSqlJs from 'sql.js';

export async function openBrowserDatabase({ wasmBinary } = {}) {
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm', wasmBinary });
  const store = await new Promise((resolve, reject) => {
    const request = indexedDB.open('hernandez-invoice-preview', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('database');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('The browser preview could not open storage.'));
  });
  const bytes = await new Promise((resolve, reject) => {
    const transaction = store.transaction('database', 'readonly');
    const request = transaction.objectStore('database').get('sqlite');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
  let inTransaction = false;
  // sql.js export reopens its connection; restore connection-local foreign keys.
  const snapshot = () => { const result = db.export(); db.run('PRAGMA foreign_keys=ON'); return result; };
  const persist = () => new Promise((resolve, reject) => {
    const transaction = store.transaction('database', 'readwrite');
    transaction.objectStore('database').put(snapshot(), 'sqlite');
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(new Error('Storage is full or unavailable. Your changes were not saved.'));
    transaction.onabort = () => reject(new Error('Storage is full or unavailable. Your changes were not saved.'));
  });
  const restoreMemory = bytes => { db.close(); db = new SQL.Database(bytes); db.run('PRAGMA foreign_keys=ON'); };
  const write = async operation => {
    if (inTransaction) return operation();
    const before = snapshot();
    try { const result = operation(); await persist(); return result; }
    catch (error) { restoreMemory(before); throw error; }
  };
  return {
    async query(sql, values = []) {
      const statement = db.prepare(sql);
      try { statement.bind(values); const result = []; while (statement.step()) result.push(statement.getAsObject()); return result; }
      finally { statement.free(); }
    },
    async execute(sql) { await write(() => db.run(sql)); },
    async run(sql, values = []) { return write(() => { db.run(sql, values); return { changes: db.getRowsModified(), lastId: db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] }; }); },
    async transaction(operation) {
      const before = snapshot();
      inTransaction = true;
      db.run('BEGIN');
      try { const result = await operation(); db.run('COMMIT'); await persist(); return result; }
      catch (error) { restoreMemory(before); throw error; }
      finally { inTransaction = false; }
    }
  };
}

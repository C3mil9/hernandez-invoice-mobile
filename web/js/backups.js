import { api, formError } from './shared.js';
import { t } from './language.js';
import { exportBackup } from '../../src/files.js';
import { validateBackup } from '../../src/backup.js';
import { getService } from '../../src/database.js';

export async function renderBackups(container, context) {
  const records = await api('/api/backup');
  container.innerHTML = `<div class="page-heading"><div><h1>${t('Backups & restore')}</h1><p class="subheading">${t('Keep a copy somewhere outside this phone.')}</p></div></div><section class="panel form-panel"><h2>${t('Your records')}</h2><div class="backup-counts"><span>${records.tables.customers.length} ${t('Clients')}</span><span>${records.tables.products.length} ${t('Products')}</span><span>${records.tables.invoices.length} ${t('Invoices')}</span></div><p>${t('Each phone has its own records. Backups transfer a complete copy; they do not merge records or sync devices.')}</p></section><section class="panel form-panel backup-section"><h2>${t('Save a backup')}</h2><p>${t('Export all clients, products, invoices, and business settings. Use the share menu to save the file to Files, iCloud Drive, Google Drive, or another safe place.')}</p><p class="notice">${t('Removing the app can remove its records. Keep your backup somewhere outside the app. Backup files contain private client information.')}</p><button id="export-backup" class="button button-primary" type="button">${t('Export backup')}</button><p id="backup-message" role="status"></p></section><form class="panel form-panel backup-section" id="restore-form"><h2>${t('Restore a backup')}</h2><p>${t('Restoring replaces every record on this phone. Export your current backup first. This action does not merge two phones.')}</p><div class="form-error" role="alert" tabindex="-1" hidden></div><label>${t('Backup file')}<input id="backup-file" type="file" accept=".json,application/json" required></label><p id="restore-summary" role="status"></p><button id="restore-backup" class="button button-secondary" type="submit" disabled>${t('Restore backup')}</button></form>`;
  const message = container.querySelector('#backup-message');
  container.querySelector('#export-backup').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await exportBackup(); message.textContent = t('Choose a safe place to keep your backup.'); }
    catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  };
  let selected;
  let selectionVersion = 0;
  const submit = container.querySelector('#restore-backup');
  const form = container.querySelector('#restore-form');
  const input = container.querySelector('#backup-file');
  input.onchange = async () => {
    const version = ++selectionVersion;
    selected = null; submit.disabled = true; form.querySelector('.form-error').hidden = true;
    container.querySelector('#restore-summary').textContent = '';
    const file = input.files[0]; if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error(t('This backup is too large to restore on this device.'));
      const backup = JSON.parse(await file.text());
      const service = await getService(); const counts = await validateBackup(service.db, backup);
      if (version !== selectionVersion) return;
      selected = backup;
      container.querySelector('#restore-summary').textContent = `${file.name} · ${counts.customers} ${t('Clients')} · ${counts.products} ${t('Products')} · ${counts.invoices} ${t('Invoices')}`;
      submit.disabled = false;
    } catch (error) { if (version === selectionVersion) formError(form, error instanceof SyntaxError ? t('This is not a valid Hernandez Invoice backup.') : error.message); }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (!selected || !window.confirm(t('Replace all records on this phone with this backup? This cannot be undone.'))) return;
    submit.disabled = true;
    try {
      await api('/api/restore', { method: 'POST', body: selected });
      context.markSaved(); context.notify(t('Backup restored.')); context.navigate('dashboard');
    } catch (error) { formError(form, error.message); submit.disabled = false; }
  };
}

/** Small layout and navigation adaptations shared by both phone platforms. */
import { isNative } from '../../src/database.js';
import { exportCsv } from '../../src/files.js';
import { t } from './language.js';

export function setupMobile(content, context) {
  if (!isNative()) {
    const badge = document.createElement('div'); badge.className = 'preview-badge';
    badge.dataset.i18n = 'Browser preview'; badge.textContent = t('Browser preview'); document.querySelector('.brand').append(badge);
  }
  document.addEventListener('click', async event => {
    const link = event.target.closest('a[href]'); if (!link) return;
    const path = link.getAttribute('href');
    if (path.startsWith('/print?')) {
      event.preventDefault(); context.navigate('view-invoice', new URL(path, window.location.href).searchParams.get('id'));
    } else if (path.startsWith('/api/exports/')) {
      event.preventDefault();
      try { await exportCsv(path); } catch (error) { context.notify(error.message); }
    }
  });
  const annotateTables = () => {
    for (const table of content.querySelectorAll('table')) {
      if (table.closest('.invoice-sheet, .report-panel')) continue;
      table.classList.add('mobile-cards');
      const labels = [...table.querySelectorAll('thead th')].map(cell => cell.textContent);
      for (const row of table.querySelectorAll('tbody tr')) [...row.cells].forEach((cell, index) => {
        if (!cell.hasAttribute('colspan')) cell.dataset.label = labels[index] || '';
      });
    }
  };
  new MutationObserver(annotateTables).observe(content, { childList: true, subtree: true });
  annotateTables();
  if (isNative()) import('@capacitor/app').then(({ App }) => {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else if (location.hash && location.hash !== '#dashboard') context.navigate('dashboard');
      else App.exitApp();
    });
  });
}

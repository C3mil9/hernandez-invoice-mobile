import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { invoicePdf } from '../src/pdf.js';

test('PDF export embeds a font, creates a valid multipage invoice, and never fetches an external asset', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(url, '/assets/fonts/DejaVuSans.ttf');
    return new Response(await readFile(new URL('../web/fonts/DejaVuSans.ttf', import.meta.url)));
  };
  try {
    const invoice = { invoice_number: 'INV-000001', business_name: 'Hernández', business_address: 'Main Street', customer_name: 'María García', status: 'Unpaid', invoice_date: '2026-11-14', due_date: '', tax_rate: '0.00', subtotal_cents: 10000, tax_cents: 0, shipping_cents: 0, total_cents: 10000, notes: 'Gracias por su compra.', items: Array.from({ length: 100 }, (_, index) => ({ name: `Café molido ${index + 1}`, sku: 'CAF', quantity: '1', unit_price_cents: 100, line_total_cents: 100 })) };
    const bytes = await invoicePdf(invoice);
    const binary = new TextDecoder('latin1').decode(bytes);
    assert.ok(binary.startsWith('%PDF-'));
    assert.ok(binary.includes('/FontFile2'));
    assert.ok((binary.match(/\/Type \/Page\b/g) || []).length >= 3);
    if (process.env.PDF_QA_DIR) {
      await mkdir(process.env.PDF_QA_DIR, { recursive: true });
      await writeFile(process.env.PDF_QA_DIR + '/mobile-invoice-qa.pdf', bytes);
    }
  } finally { globalThis.fetch = originalFetch; }
});

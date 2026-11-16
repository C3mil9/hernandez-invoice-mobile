# Validation record

The mobile app source was checked with Node.js 24.22.1 and Python 3.12. The desktop app source used for migration compatibility was `Hernandez_Invoice.zip`, version 6.

| Check | Result |
| --- | --- |
| `npm test` | 11 tests passed |
| `npm run build` | Offline web bundle generated successfully |
| `npx cap add android` / `npx cap add ios` | Both native projects generated; four native plugins discovered on each platform |
| `npx cap sync` | Latest web assets and plugin configuration copied to both native projects |
| Exact amounts | Half-up line/tax rounding verified, including fractional quantities |
| Invoice history | Customer and business snapshots preserved across edits; changing clients takes a new client snapshot |
| Archived records | Existing invoice edits remain allowed; new invoices reject archived selections |
| Reports | Paid and unpaid included; void excluded; correct invoice month grouping |
| Bad input | Invalid dates, amounts, products, SQL-like names, and malformed writes handled |
| Backup integrity | Full round trip preserves all five record tables and IDs |
| Invalid backups | Bad totals, duplicate IDs, missing fields, bad references, fractional integers, and unsupported versions rejected before replacement |
| Storage failure | Simulated failure halfway through restore rolls back the original records |
| Browser preview persistence | SQL.js and IndexedDB persist data across reopened connections; foreign keys stay enabled after export |
| PDF | 100-item invoice creates a seven-page PDF; embedded font and accented names verified; first and last pages visually inspected |
| Desktop migration | Read-only Python export restored into the mobile service; customer/items and exact total matched the desktop result; source database hash unchanged |

## Limits

These checks do not replace native builds or real-device tests. Android and iOS compilation, signing, installation, native SQLite plugin execution, native share sheets, and OS file pickers have not been exercised here. The browser available for visual testing could not reach the local preview, so the phone UI has not been visually verified in a running browser or on a phone. The PDF renderer was available and its output was inspected separately.

Before using the app with business records, complete these checks on both platforms:

1. Build, install, and launch the signed app. Check the icon, safe areas, navigation, Spanish text, and the numeric keyboard on narrow screens.
2. Enter a client, a product, business settings, and an invoice. Save, edit, mark paid, and check reports.
3. Enable airplane mode. Save another invoice, terminate the app, reopen it, and confirm the records remain.
4. Share a PDF, save it, open it in a PDF viewer, and check names, amounts, and page breaks. Test both short and 100-item invoices.
5. Export a backup outside the app. Restore it into a separate disposable test installation and verify counts, invoice numbers, details, archives, and totals.
6. Test cancelling the share menu, selecting an invalid backup, declining replacement, navigating away from an unsaved form, and storage failures where practical.
7. Install an update over the same signed application ID and verify data is preserved. Keep a separate exported backup throughout testing.

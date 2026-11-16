# Hernandez Invoice Mobile

An offline invoice app for **iPhone and Android**. The installed app contains its own interface and SQLite database. It does not connect to the desktop invoice app or require a computer, Wi-Fi, a subscription, or an account for everyday use.

**Delivery status:** This ZIP contains source code, a built interface, and generated Android Studio and Xcode projects. It is not an APK or an installable iPhone app. Native compilation, signing, and testing on real devices are still required. The computer and development tools below are needed to build and install the app, not to use it afterward.

## Included

- Clients and products: add, edit, search, archive, restore, and export CSV.
- Invoices: saved products or custom items, searchable products, quantities, editable prices, shipping, tax, notes, due dates, and paid/unpaid/void status.
- Exact integer money calculations and historical snapshots of customer and business details.
- An invoice viewer and PDF export using the phone's share menu. Save or open the PDF with another app to print it.
- Monthly/yearly sales reports and CSV exports.
- English and Spanish.
- Full backup export, backup validation, and transactional restore.
- Touch controls, bottom navigation, phone-sized list cards, decimal keyboards, and safe-area spacing.

Each phone has an independent database. **There is no automatic syncing between phones or with the desktop app.** Restoring a backup replaces that phone's records; it does not merge them. The new mobile installation starts empty until records are entered or a backup is restored.

## Try the development preview

Install Node.js **22 or newer**. Node.js 24 is needed to run the included `node:sqlite` tests without extra dependencies.

```bash
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/`. This local preview stores a SQLite database in that browser's IndexedDB. Its badge says **Browser preview**. It is for development and is not a phone installation; clearing its site data deletes the preview records. Native builds use the phone's SQLite database instead.

The built interface is also included under `dist/`. Do not open `index.html` directly from a file manager; use the preview server or the native app.

## Build for Android

1. Install Android Studio and its SDK tools. This project targets Android SDK **36**, supports Android API **24+**, and uses Java **21**. Android Studio supplies a JDK; select its compatible JDK in Gradle settings.
2. In this folder run:

   ```bash
   npm ci
   npm run android
   ```

3. Let Android Studio resolve dependencies. Select a connected phone or emulator, then **Run**.
4. To make a reusable installer, use **Build > Generate Signed App Bundle or APK**, select APK, and create or select your own signing key. Keep that key private and backed up. A release for Google Play uses an Android App Bundle and the store's review process.

The `android/` project is already generated. `npm run setup:android` is only for regenerating a missing platform folder; do not run it over the included project.

## Build for iPhone

1. Use a Mac with **Xcode 26+**, its Command Line Tools, and Node.js 22+. The included project uses Swift Package Manager.
2. In this folder run:

   ```bash
   npm ci
   npm run ios
   ```

3. In Xcode, select the **App** target. In **Signing & Capabilities**, select your Apple development team and use a bundle identifier you control. The example identifier is `com.hernandez.invoice`.
4. Select your connected iPhone or an iPhone simulator and press **Run**. For distribution to other people, configure the appropriate Apple signing and TestFlight/App Store distribution. Development signing is not a permanent public installer.

The `ios/` project, app icons, and required filesystem privacy manifest are included. Review privacy and distribution declarations for your final build before submitting to a store. No Apple credentials or signing certificates are included.

The official [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) documents current platform requirements. The SQLite integration uses [capacitor-community/sqlite](https://github.com/capacitor-community/sqlite); native dependencies are resolved when building in Android Studio or Xcode.

## Back up and transfer records

1. Tap **Backups > Export backup**.
2. In the phone's share menu, save the JSON file somewhere outside the app, such as Files, iCloud Drive, Google Drive, or a backup drive. The app does not automatically upload to those services.
3. On a replacement phone, install the app, open **Backups**, select the backup file, inspect the counts, and confirm **Restore backup**.

Deleting the app, losing the phone, or a device failure can lose its records. An exported backup only protects you if it is saved somewhere you can access without that phone. Backups are unencrypted JSON containing private business and client data. Protect them and use your device's screen lock. This version has no additional app PIN or biometric lock.

Restore checks the format, fields, duplicate IDs, record references, invoice amounts, and supported version before deleting records. Deletes and inserts run in one transaction, so an insertion/storage failure rolls back the restore. Export the current phone's backup before replacing records, since a successful replacement has no undo.

## Move existing desktop data to the phone

This optional one-time step needs the desktop database. It does not change it or turn on syncing.

1. Save your work and close the desktop app. Keep a normal database backup.
2. On a computer with Python, run this helper using the actual desktop database path:

   ```bash
   python3 tools/export_desktop_backup.py "/path/to/hernandez-invoice/data/hernandez_invoice.sqlite3" desktop.invoice-backup.json
   ```

   On Windows use `py -3` instead of `python3`.

3. Transfer the exported JSON to the phone through your usual private file transfer method, then restore it from **Backups**.

The helper preserves invoice numbers, archived records, settings, items, and historical snapshots. Restoring the exported JSON replaces the phone's existing records.

## Maintain and update

The interface remains HTML, CSS, and JavaScript. Capacitor packages it as a native app; the desktop Python HTTP server is replaced with a local JavaScript service.

| Location | Purpose |
| --- | --- |
| `web/` | Screens, translations, navigation, and responsive styles |
| `src/database.js` | Native SQLite adapter and startup |
| `src/service.js` | Client/product/invoice/report operations |
| `src/validation.js` | Input rules and exact money calculations |
| `src/backup.js` | Complete backups and transactional restore |
| `src/pdf.js` | Multipage PDF generation with an embedded Unicode font |
| `src/files.js` | Native file sharing and CSV/backup exports |
| `src/browser_database.js` | Persistent development-preview database |
| `android/`, `ios/` | Native projects; preserve your own signing configuration |
| `tests/` | Calculation, history, backup, storage, and PDF checks |

After edits, run `npm test`, `npm run build`, and `npx cap sync`. Then build and test the native app again. Install updates over the existing app using the same bundle/application identifier and signing identity. Do not uninstall as an update procedure; export a backup before testing an upgrade.

Business records are runtime data in the installed app, separate from these source files. Keep exported backups, databases, signing keys, and generated personal files out of Git. `.gitignore` includes common private-data and signing-key patterns.

## Validation status and remaining device checks

Automated checks cover exact rounding, invoice edits and historical snapshots, archived records, report totals, malformed writes, backup round trips, corrupt backups, transaction rollback on simulated storage failure, development-preview persistence, and a 100-item multipage PDF with an embedded font. `TESTING.md` records the completed checks and remaining native verification.

**Native compilation and real-device UI testing were not run in the creation environment.** Before relying on the app for business records, verify launch, keyboard/scroll behavior, airplane-mode saving and reopening, file import, PDF sharing, backup export/restore, and an upgrade on both a real iPhone and a real Android phone. Keep a separate backup while doing this.

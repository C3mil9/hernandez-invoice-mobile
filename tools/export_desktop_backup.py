"""Export an existing desktop SQLite database as a mobile-compatible backup.

The source is opened read-only, in a single consistent read transaction. The
output deliberately stays outside the database and must be kept private.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

TABLES = ('customers', 'products', 'business_settings', 'invoices', 'invoice_items')


def export_database(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output:
        raise ValueError('The output must be different from the database.')
    if not source.is_file():
        raise ValueError('The desktop database was not found.')
    # Exclusive file creation prevents accidentally overwriting an earlier backup.
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as db:
        db.row_factory = sqlite3.Row
        db.execute('BEGIN')
        tables = {table: [dict(row) for row in db.execute(f'SELECT * FROM {table} ORDER BY id')]
                  for table in TABLES}
        db.rollback()
    backup = {'format': 'hernandez-invoice-mobile', 'version': 1,
              'created_at': datetime.now(timezone.utc).isoformat(), 'tables': tables}
    with output.open('x', encoding='utf-8') as stream:
        json.dump(backup, stream, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', help='Path to data/hernandez_invoice.sqlite3')
    parser.add_argument('output', help='New output filename ending in .invoice-backup.json')
    args = parser.parse_args()
    try:
        export_database(args.database, args.output)
    except (OSError, ValueError, sqlite3.Error) as error:
        parser.exit(1, str(error) + '\n')
    print('Backup exported. Transfer it to the phone, then open Backups > Restore a backup.')


if __name__ == '__main__':
    main()

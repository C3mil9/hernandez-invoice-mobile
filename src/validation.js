/** Validate all writes independently of the form. Use integers and BigInt for money. */
export function text(value, label, required = false, limit = 500) {
  if (value == null) value = '';
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  value = value.trim();
  if (required && !value) throw new Error(`${label} is required.`);
  if ([...value].length > limit) throw new Error(`${label} must be ${limit} characters or fewer.`);
  return value;
}

export function scaled(value, label, places, minimum, maximum) {
  const raw = String(value ?? '').trim();
  if (raw.length > 30 || !/^\d+(?:\.\d+)?$/.test(raw)) throw new Error(`${label} must be a valid nonnegative number.`);
  const [whole, fraction = ''] = raw.split('.');
  if (fraction.length > places) throw new Error(`${label} can have at most ${places} decimal places.`);
  const result = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
  if (result < BigInt(minimum) || result > BigInt(maximum)) throw new Error(`${label} is outside the allowed range.`);
  return Number(result);
}
export const money = (value, label) => scaled(value, label, 2, 0, 9999999900);
export const quantity = value => scaled(value, 'Quantity', 3, 1, 100000000);
export const taxRate = value => scaled(value, 'Tax rate', 2, 0, 10000);
export function decimal(value, places) {
  return `${Math.trunc(value / 10 ** places)}.${String(value % 10 ** places).padStart(places, '0')}`;
}
export function id(value, label) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`Select a valid ${label}.`);
  return Number(value);
}
export function date(value, label, required = true) {
  const raw = text(value, label, required, 10);
  if (!raw) return '';
  const parsed = new Date(raw + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || raw.startsWith('0000') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error(`${label} must be a valid date.`);
  return raw;
}
export function status(value) {
  if (!['Paid', 'Unpaid', 'Void'].includes(value)) throw new Error('Select a valid invoice status.');
  return value;
}
export function calculate(items, basisPoints, shipping) {
  const lines = items.map(item => Number((BigInt(item.quantity_milli) * BigInt(item.unit_price_cents) + 500n) / 1000n));
  const subtotal = lines.reduce((sum, value) => sum + value, 0);
  if (subtotal > 1000000000000) throw new Error('The invoice subtotal is too large.');
  const tax = Number((BigInt(subtotal) * BigInt(basisPoints) + 5000n) / 10000n);
  return { lines, subtotal, tax, total: subtotal + tax + shipping };
}

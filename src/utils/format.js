export function formatNepaliPhone(value) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  const normalized = digits.startsWith('977') ? digits.slice(3) : digits;
  const phone = normalized.slice(0, 10);
  if (!phone) return '';
  return `+977-${phone}`;
}

export function formatRs(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'RS 0.00';
  return `RS ${value.toFixed(2)}`;
}

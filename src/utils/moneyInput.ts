// Live thousands-grouping for whole-number amount inputs (no decimals) —
// dot separator, e.g. typing "150000" displays "150.000".

export function formatThousands(digits: string): string {
  const clean = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!clean) return '';
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function parseThousands(display: string): number {
  const clean = display.replace(/\D/g, '');
  return clean ? Number(clean) : 0;
}

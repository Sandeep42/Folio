/** Formatting helpers matching the desktop app's api.js */

export const inr = (v: number | null | undefined, d = 0): string => {
  if (v == null) return '—';
  return v.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
};

export const pct = (v: number | null | undefined): string => {
  if (v == null) return '—';
  return (v * 100).toFixed(2) + '%';
};

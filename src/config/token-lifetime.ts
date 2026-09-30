// Numeric values are seconds; suffixed values support s, m, h, d and w.
export function tokenLifetimeSeconds(value: string | number): number {
  const match = /^(\d+)(s|m|h|d|w)?$/.exec(String(value));
  const units: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  const seconds = match ? Number(match[1]) * units[match[2] ?? 's'] : NaN;
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error('Token lifetime must be positive seconds or use s/m/h/d/w');
  }
  return seconds;
}

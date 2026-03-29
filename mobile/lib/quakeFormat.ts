import type { QuakeEvent } from '@/lib/api';

export function magBucketColor(mag: number, scheme: 'light' | 'dark'): string {
  if (mag >= 4) return scheme === 'dark' ? '#f87171' : '#dc2626';
  if (mag >= 2.5) return scheme === 'dark' ? '#fb923c' : '#ea580c';
  if (mag >= 1.5) return scheme === 'dark' ? '#facc15' : '#ca8a04';
  return scheme === 'dark' ? '#2dd4bf' : '#0d9488';
}

export function magLabelColor(mag: number, scheme: 'light' | 'dark'): string {
  if (mag >= 3.5) return scheme === 'dark' ? '#fb923c' : '#c2410c';
  if (mag >= 2) return scheme === 'dark' ? '#fbbf24' : '#a16207';
  return scheme === 'dark' ? '#5eead4' : '#0f766e';
}

export function formatCoordShort(lat: number, lon: number): string {
  return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
}

export function formatQuakeDateTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTimeTr(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return 'Az önce';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} saat önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

export function filterQuakes(
  events: QuakeEvent[],
  query: string,
  maxAgeSec: number | null
): QuakeEvent[] {
  const now = Date.now() / 1000;
  let out = events;
  if (maxAgeSec != null)
    out = out.filter((e) => now - e.timestamp <= maxAgeSec);
  const q = query.trim().toLowerCase();
  if (!q) return out;
  return out.filter((e) => {
    const blob = `${e.mag} ${formatCoordShort(e.lat, e.lon)} ${e.depth}`.toLowerCase();
    return blob.includes(q);
  });
}

export function countBuckets(events: QuakeEvent[]) {
  let high = 0;
  let mid = 0;
  let low = 0;
  for (const e of events) {
    if (e.mag >= 4) high += 1;
    else if (e.mag >= 2) mid += 1;
    else low += 1;
  }
  return { high, mid, low };
}

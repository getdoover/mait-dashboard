// The viewer's own locale and time zone.
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayTimeFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function fmtClock(ms: number | undefined, now: number): string {
  if (ms == null) return "—";
  return now - ms < 20 * 3_600_000 && new Date(ms).getDate() === new Date(now).getDate() ? timeFmt.format(ms) : dayTimeFmt.format(ms);
}

export function fmtNum(v: number | null | undefined, digits: number): string {
  if (v == null) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export function fmtAgo(ms: number | undefined, now: number): string {
  if (ms == null) return "never";
  const d = now - ms;
  if (d < 60_000) return "just now";
  return `${fmtDuration(d)} ago`;
}

type App = { email: string; source?: string | null; createdAt: Date };
type Resv = { email: string; source?: string | null; status: string; createdAt: Date };

const norm = (e: string) => e.trim().toLowerCase();
const src = (s?: string | null) => (s && s.trim()) || "(直接)";

export function computeAttribution(applications: App[], reservations: Resv[]) {
  const appByEmail = new Map<string, Date>();
  for (const a of applications) {
    if (!a.email) continue;
    const k = norm(a.email);
    const c = appByEmail.get(k);
    if (!c || a.createdAt < c) appByEmail.set(k, a.createdAt);
  }
  const m = new Map<string, { source: string; applications: number; ocReservations: number; ocConverted: number }>();
  const get = (s: string) => {
    let e = m.get(s);
    if (!e) {
      e = { source: s, applications: 0, ocReservations: 0, ocConverted: 0 };
      m.set(s, e);
    }
    return e;
  };
  for (const a of applications) get(src(a.source)).applications++;
  for (const r of reservations) {
    const e = get(src(r.source));
    e.ocReservations++;
    const d = appByEmail.get(norm(r.email));
    if (d && d >= r.createdAt) e.ocConverted++;
  }
  return Array.from(m.values())
    .map((e) => ({ ...e, ocConvRate: e.ocReservations > 0 ? e.ocConverted / e.ocReservations : 0 }))
    .sort((a, b) => b.applications - a.applications);
}

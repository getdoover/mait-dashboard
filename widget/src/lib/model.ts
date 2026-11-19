// Pure logic for the dashboard: config parsing, reading other apps' tags and
// ui_state, and turning them into what a card shows. No React, no I/O, so it
// can be tested with `node --test`.

export type Json = unknown;
export type Dict = Record<string, unknown>;

export interface ItemConfig {
  device: string;
  appKey: string;
  label?: string;
}
export interface PumpItemConfig extends ItemConfig {
  target: string;
}

export interface DashboardConfig {
  title: string;
  tanks: ItemConfig[];
  pumps: PumpItemConfig[];
  flowMeters: ItemConfig[];
  pivots: ItemConfig[];
  linkHealthAppKey: string | null;
  lowLevelPct: number;
  criticalLevelPct: number;
  staleAfterMs: number;
}

const isDict = (v: unknown): v is Dict => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);
export const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const numOr = (v: unknown, d: number) => num(v) ?? d;

function items(raw: unknown, defaultKey: string): ItemConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    if (!isDict(r)) return [];
    const device = str(r.device);
    if (!device) return [];
    return [{ device, appKey: str(r.app_key) ?? defaultKey, label: str(r.label) }];
  });
}

/** This install's config, from its block of the agent's deployment_config. */
export function parseConfig(app: Dict | undefined): DashboardConfig {
  const a = app ?? {};
  const pumps: PumpItemConfig[] = Array.isArray(a.pumps)
    ? a.pumps.flatMap((r) => {
        if (!isDict(r)) return [];
        const device = str(r.device);
        const target = str(r.target);
        if (!device || !target) return [];
        return [{ device, appKey: str(r.app_key) ?? "pump_control_1", target, label: str(r.label) }];
      })
    : [];
  const lh = a.link_health_app_key;
  return {
    title: str(a.title) ?? "Site Overview",
    tanks: items(a.tanks, "analog_level_sensor_processor_1"),
    pumps,
    flowMeters: items(a.flow_meters, "flow_meter_processor_1"),
    pivots: items(a.pivots, "pivot_control_1"),
    linkHealthAppKey: lh === undefined ? "link_health_1" : (str(lh) ?? null),
    lowLevelPct: numOr(a.low_level_pct, 30),
    criticalLevelPct: numOr(a.critical_level_pct, 10),
    staleAfterMs: numOr(a.stale_after_min, 30) * 60_000,
  };
}

/** A dotted field, whether the server returned it nested or under its full dotted key. */
export function readPath(data: unknown, path: string): unknown {
  if (!isDict(data)) return undefined;
  if (path in data) return data[path];
  let node: unknown = data;
  for (const part of path.split(".")) {
    if (!isDict(node)) return undefined;
    node = node[part];
  }
  return node;
}

/** An install's root in a ui_state aggregate. */
export const uiAppPath = (appKey: string) => `state.children.${appKey}`;
export const uiElementPath = (appKey: string, ...names: string[]) =>
  [uiAppPath(appKey), ...names.flatMap((n) => ["children", n])].join(".");

/** The tag a ui element shows: `$tag.app().level_reading:number:null` -> `level_reading`. */
export function boundTag(element: unknown): string | undefined {
  const cv = isDict(element) ? element.currentValue : undefined;
  if (typeof cv !== "string") return undefined;
  const m = /^\$tag\.app\(\)\.([A-Za-z0-9_]+)/.exec(cv);
  return m?.[1];
}

export const unitsOf = (element: unknown): string | undefined =>
  isDict(element) && typeof element.units === "string" ? element.units : undefined;

export const precisionOf = (element: unknown, fallback: number): number => {
  const p = isDict(element) ? num(element.decPrecision) : null;
  return p == null ? fallback : Math.max(0, Math.min(4, p));
};

// -- pumps --------------------------------------------------------------------

/** Pump Control's slug for a target (model.slug). */
export function slug(target: string): string {
  const s = String(target ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "pump";
}

export type PumpStatus = "running" | "stopped" | "pending" | "fault" | "unknown" | "nodata";

export interface PumpView {
  name?: string;
  status: PumpStatus;
  running: boolean | null;
  /** The verb Pump Control is waiting on the pump to confirm. */
  pendingVerb?: "start" | "stop";
  pendingSince?: number;
  fault: boolean;
  /** Pump Control's own line about the last command. */
  commandText?: string;
  /** Shown while Pump Control reports a command not confirmed or rejected. */
  warning?: string;
  showStart: boolean;
  showStop: boolean;
  endsAt?: number;
  lastStarted?: number;
  lastStopped?: number;
  hoursToday?: number;
  startsToday?: number;
}

/** A pump's card, from its Pump Control install's tags. Reported state only. */
export function pumpView(tags: Dict | undefined, target: string): PumpView {
  const s = slug(target);
  const t = (f: string) => tags?.[`p_${s}_${f}`];
  const known = !!tags && Object.keys(tags).some((k) => k.startsWith(`p_${s}_`));
  const running = typeof t("running") === "boolean" ? (t("running") as boolean) : null;
  const pending = isDict(t("pending")) ? (t("pending") as Dict) : undefined;
  const verb = pending?.command === "start" || pending?.command === "stop" ? (pending.command as "start" | "stop") : undefined;
  const fault = t("fault") === true;
  const warningShown = t("cmd_warning_hidden") === false;

  let status: PumpStatus;
  if (!known) status = "nodata";
  else if (fault) status = "fault";
  else if (pending) status = "pending";
  else if (running === true) status = "running";
  else if (running === false) status = "stopped";
  else status = "unknown";

  return {
    name: str(t("name")),
    status,
    running,
    pendingVerb: verb,
    pendingSince: num(pending?.sent_at) ?? undefined,
    fault,
    commandText: str(t("cmd_text")),
    warning: warningShown ? str(t("cmd_warning")) : undefined,
    // Pump Control decides which control the reported state calls for; with
    // nothing reported yet, offer both (a Stop must always be at hand).
    showStart: t("start_hidden") !== true,
    showStop: t("stop_hidden") !== true,
    endsAt: num(t("ends_at")) ?? undefined,
    lastStarted: num(t("last_started")) ?? undefined,
    lastStopped: num(t("last_stopped")) ?? undefined,
    hoursToday: num(t("hours_today")) ?? undefined,
    startsToday: num(t("starts_today")) ?? undefined,
  };
}

/** The pump's run-time input on its own page, if it runs timed. */
export interface RunTime {
  minutes: number;
  max?: number;
}

/**
 * What a Start will run for: the operator's last entry in the pump page's
 * "Start For (min)" input (kept in that device's ui_cmds), else its default.
 * Undefined for a latched pump (no input).
 */
export function runTime(minutesElement: unknown, uiCmdsApp: Dict | undefined, target: string): RunTime | undefined {
  if (!isDict(minutesElement)) return undefined;
  const set = num(uiCmdsApp?.[`p_${slug(target)}_minutes`]);
  const minutes = set ?? num(minutesElement.default);
  if (minutes == null) return undefined;
  return { minutes, max: num(minutesElement.max) ?? undefined };
}

/** The ui_cmds RPC the pump page's Start / Stop button posts (customer-site uiCommandRpcData). */
export function buttonRpc(
  appKey: string,
  target: string,
  verb: "start" | "stop",
  now: number,
  actor?: { id: string; name: string; email: string },
): Dict {
  return {
    type: "rpc",
    app_key: appKey,
    method: `p_${slug(target)}_${verb}`,
    request: now,
    ...(actor ? { actor } : {}),
    label: verb === "start" ? "Start" : "Stop",
  };
}

/** The ui_cmds aggregate marker customer-site writes after posting an RPC. */
export const rpcMarker = (appKey: string, method: string, messageId: string): Dict => ({
  [appKey]: { v2: { [method]: { message_id: messageId } } },
});

// -- tanks --------------------------------------------------------------------

export type Band = "critical" | "low" | "ok" | "fault" | "nodata";

export interface TankView {
  pct: number | null;
  level: number | null;
  levelUnits: string;
  levelPrecision: number;
  volume: number | null;
  volumeUnits?: string;
  band: Band;
  faultText?: string;
}

export function levelBand(pct: number | null, low: number, critical: number): Band {
  if (pct == null) return "nodata";
  if (pct <= critical) return "critical";
  if (pct <= low) return "low";
  return "ok";
}

export function tankView(tags: Dict | undefined, uiApp: unknown, low: number, critical: number): TankView {
  const levelEl = readPath(uiApp, "children.level_reading");
  const volumeEl = readPath(uiApp, "children.volume");
  const levelTag = boundTag(levelEl) ?? "level_reading";
  const fault = str(tags?.sensor_fault);
  const pctRaw = num(tags?.level_filled_percentage);
  const pct = pctRaw == null ? null : Math.max(0, Math.min(100, pctRaw));
  const volumeShown = isDict(volumeEl) && volumeEl.hidden !== true;
  return {
    pct: fault ? null : pct,
    level: fault ? null : num(tags?.[levelTag]),
    levelUnits: unitsOf(levelEl) ?? "m",
    levelPrecision: precisionOf(levelEl, 2),
    volume: fault || !volumeShown ? null : num(tags?.level_volume),
    volumeUnits: unitsOf(volumeEl),
    band: fault ? "fault" : levelBand(pct, low, critical),
    faultText: fault ? (str(tags?.sensor_fault_message) ?? "Sensor fault") : undefined,
  };
}

// -- flow -----------------------------------------------------------------------

export interface FlowView {
  rate: number | null;
  rateUnits: string;
  ratePrecision: number;
  /** Top of the rate's gauge, from the flow app's own range, in rate units. */
  rateMax?: number;
  flowing: boolean | null;
  today: number | null;
  yesterday: number | null;
  total: number | null;
  volumeUnits: string;
  volumePrecision: number;
  lastFlow?: number;
  lastReading?: number;
  faultText?: string;
}

export function flowView(tags: Dict | undefined, uiApp: unknown): FlowView {
  const rateEl = readPath(uiApp, "children.flow_rate");
  const totalEl = readPath(uiApp, "children.total_volume");
  const tag = (el: unknown, fallback: string) => num(tags?.[boundTag(el) ?? fallback]);
  const ranges = isDict(rateEl) && Array.isArray(rateEl.ranges) ? rateEl.ranges : [];
  const tops = ranges.map((r) => (isDict(r) ? num(r.max) : null)).filter((v): v is number => v != null && v > 0);
  const fault = str(tags?.sensor_fault);
  return {
    rate: fault ? null : tag(rateEl, "flow_rate_display"),
    rateUnits: unitsOf(rateEl) ?? "L/s",
    ratePrecision: precisionOf(rateEl, 2),
    rateMax: tops.length ? Math.max(...tops) : undefined,
    flowing: typeof tags?.flowing === "boolean" ? tags.flowing : null,
    today: tag(readPath(uiApp, "children.today_volume"), "today_volume_display"),
    yesterday: tag(readPath(uiApp, "children.yesterday_volume"), "yesterday_volume_display"),
    total: tag(totalEl, "total_volume_display"),
    volumeUnits: unitsOf(totalEl) ?? "L",
    volumePrecision: precisionOf(totalEl, 0),
    lastFlow: num(tags?.last_flow_ts) ?? undefined,
    lastReading: num(tags?.last_reading_ts) ?? undefined,
    faultText: fault ? (str(tags?.sensor_fault_message) ?? "Sensor fault") : undefined,
  };
}

// -- pivots ---------------------------------------------------------------------

export interface PivotView {
  state: "running" | "stopped" | "unknown" | "nodata";
  status: string;
  direction?: string;
  angle: number | null;
  heading?: string;
  speed: number | null;
  safetyOk: boolean | null;
  pending: boolean;
  commandText?: string;
}

export function pivotView(tags: Dict | undefined): PivotView {
  const st = str(tags?.state);
  const state: PivotView["state"] =
    st === "running" || st === "stopped" ? st : tags && Object.keys(tags).length ? "unknown" : "nodata";
  return {
    state,
    status: str(tags?.status) ?? "No reading yet",
    direction: str(tags?.direction),
    angle: num(tags?.angle_deg),
    heading: str(tags?.heading),
    speed: num(tags?.speed_percent),
    safetyOk: typeof tags?.safety_ok === "boolean" ? tags.safety_ok : null,
    pending: isDict(tags?.pending_command) && tags.pending_command.timed_out !== true,
    commandText: str(tags?.command_message),
  };
}

// -- radio link ------------------------------------------------------------------

export interface LinkView {
  status: "online" | "offline" | "degraded" | "unknown";
  label: string;
  lastHeard?: number;
  route?: string;
  linkPct: number | null;
}

export function linkView(tags: Dict | undefined): LinkView | undefined {
  if (!tags) return undefined;
  const s = str(tags.status);
  const colour = str(tags.status_colour);
  const status: LinkView["status"] =
    s === "online" ? (colour === "orange" || colour === "amber" ? "degraded" : "online") : s === "offline" ? "offline" : s ? "degraded" : "unknown";
  return {
    status: s === "unknown" ? "unknown" : status,
    label: str(tags.status_label) ?? "No data yet",
    lastHeard: num(tags.last_heard_ts) ?? undefined,
    route: str(tags.route),
    linkPct: num(tags.link_success_pct),
  };
}

export const isStale = (ts: number | undefined, now: number, staleAfterMs: number) =>
  ts != null && staleAfterMs > 0 && now - ts > staleAfterMs;

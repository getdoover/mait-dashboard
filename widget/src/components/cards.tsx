import { useEffect, useId, useState, type ReactNode } from "react";

import { fmtAgo, fmtClock, fmtDuration, fmtNum } from "../lib/format";
import { isStale, type Band, type FlowView, type LinkView, type PivotView, type PumpStatus, type PumpView, type RunTime, type TankView } from "../lib/model";
import { Button, Card, Dot, Pill, Spinner, Stat } from "./ui";

export const COLOURS = {
  run: "#16a34a",
  halt: "#dc2626",
  pending: "#d97706",
  idle: "#64748b",
  none: "#94a3b8",
  water: "#2563eb",
  low: "#f59e0b",
  critical: "#ef4444",
  flow: "#0891b2",
};

const LINK_COLOUR: Record<LinkView["status"], string> = {
  online: COLOURS.run,
  degraded: COLOURS.low,
  offline: COLOURS.halt,
  unknown: COLOURS.none,
};

/** The device's radio link: a dot, with its status, route and last report on hover. */
export function LinkBadge({ link, now }: { link?: LinkView; now: number }) {
  if (!link) return null;
  const title = [
    `Radio link: ${link.label}`,
    link.linkPct != null ? `Link success ${Math.round(link.linkPct)} %` : null,
    link.route ? `Route ${link.route}` : null,
    `Last heard ${fmtAgo(link.lastHeard, now)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title={title}>
      <Dot colour={LINK_COLOUR[link.status]} />
      {link.status === "offline" ? "Offline" : fmtAgo(link.lastHeard, now)}
    </span>
  );
}

function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold leading-tight">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function StaleNote({ ts, now }: { ts?: number; now: number }) {
  return (
    <div className="text-[11px] font-medium" style={{ color: COLOURS.low }}>
      Stale · last heard {fmtAgo(ts, now)}
    </div>
  );
}

// -- pumps ----------------------------------------------------------------------

const PUMP_LOOK: Record<PumpStatus, { colour: string; label: string }> = {
  running: { colour: COLOURS.run, label: "Running" },
  stopped: { colour: COLOURS.idle, label: "Stopped" },
  pending: { colour: COLOURS.pending, label: "Pending" },
  fault: { colour: COLOURS.halt, label: "Fault" },
  unknown: { colour: COLOURS.none, label: "Unknown" },
  nodata: { colour: COLOURS.none, label: "No data" },
};

function Impeller({ colour, spinning }: { colour: string; spinning: boolean }) {
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      style={{ background: `color-mix(in oklab, ${colour} 15%, transparent)`, color: colour }}
    >
      <svg viewBox="0 0 24 24" className={`h-6 w-6 ${spinning ? "animate-spin" : ""}`} style={{ animationDuration: "1.6s" }} fill="currentColor" aria-hidden>
        <circle cx="12" cy="12" r="2.4" />
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} transform={`rotate(${a} 12 12)`} d="M12 9.2c.6-2.6 2.3-5 5-5.6.6 1.6-.2 4.2-3 6.1-.6.4-1.3.4-2-.5Z" />
        ))}
      </svg>
    </span>
  );
}

export type SendState = { verb: "start" | "stop"; at: number; error?: string } | undefined;

export function PumpCard({
  title,
  subtitle,
  view,
  runTime,
  link,
  stale,
  lastHeard,
  now,
  sending,
  onCommand,
}: {
  title: string;
  subtitle?: string;
  view: PumpView;
  runTime?: RunTime;
  link?: LinkView;
  stale: boolean;
  lastHeard?: number;
  now: number;
  sending: SendState;
  onCommand: (verb: "start" | "stop") => void;
}) {
  const [confirm, setConfirm] = useState<"start" | "stop" | null>(null);
  // A confirm left open goes away on its own rather than lingering for the next person.
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), 15_000);
    return () => clearTimeout(t);
  }, [confirm]);

  const look = PUMP_LOOK[view.status];
  const awaitingTags = sending && !sending.error && view.status !== "pending" && now - sending.at < 20_000;
  const pillLabel =
    view.status === "pending"
      ? view.pendingVerb === "stop"
        ? "Stopping…"
        : "Starting…"
      : awaitingTags
        ? sending!.verb === "stop"
          ? "Sending Stop…"
          : "Sending Start…"
        : look.label;
  const pillColour = awaitingTags ? COLOURS.pending : look.colour;

  let detail: string | undefined;
  if (view.running === true && view.lastStarted) detail = `Running for ${fmtDuration(now - view.lastStarted)}`;
  else if (view.running === false && view.lastStopped) detail = `Stopped at ${fmtClock(view.lastStopped, now)}`;
  if (view.running === true && view.endsAt && view.endsAt > now) detail = `${detail ? `${detail} · ` : ""}ends ${fmtClock(view.endsAt, now)}`;

  const busy = !!awaitingTags;

  return (
    <Card className="flex flex-col gap-3 p-4" style={{ borderTop: `3px solid ${pillColour}` }}>
      <CardHeader title={title} subtitle={subtitle} right={<LinkBadge link={link} now={now} />} />
      <div className="flex items-center gap-3">
        <Impeller colour={pillColour} spinning={view.status === "running" || (view.status === "pending" && view.running === true)} />
        <div className="flex min-w-0 flex-col gap-1">
          <div>
            <Pill colour={pillColour}>
              {(view.status === "pending" || awaitingTags) && <Spinner className="h-3 w-3" />}
              {pillLabel}
            </Pill>
          </div>
          <div className="truncate text-xs text-muted-foreground">{detail ?? (view.status === "nodata" ? "No state reported yet" : " ")}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Hours today" value={fmtNum(view.hoursToday, 1)} unit="h" />
        <Stat label="Starts today" value={fmtNum(view.startsToday, 0)} />
        <Stat label="Last started" value={fmtClock(view.lastStarted, now)} />
      </div>

      {stale && <StaleNote ts={lastHeard} now={now} />}
      {view.warning && (
        <div className="rounded-md px-2.5 py-1.5 text-xs" style={{ color: COLOURS.pending, background: `color-mix(in oklab, ${COLOURS.pending} 12%, transparent)` }}>
          {view.warning}
        </div>
      )}
      {sending?.error && (
        <div className="rounded-md px-2.5 py-1.5 text-xs" style={{ color: COLOURS.halt, background: `color-mix(in oklab, ${COLOURS.halt} 12%, transparent)` }}>
          Couldn't send {sending.verb === "stop" ? "Stop" : "Start"}: {sending.error}
        </div>
      )}
      {view.commandText && !view.warning && <div className="truncate text-[11px] text-muted-foreground" title={view.commandText}>{view.commandText}</div>}

      <div className="mt-auto border-t border-solid border-border pt-3">
        {confirm ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px]">
              {confirm === "stop" ? "Stop this pump?" : runTime ? `Start for ${fmtNum(runTime.minutes, 0)} min?` : "Start this pump?"}
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm === "stop" ? "stop" : "go"}
                onClick={() => {
                  onCommand(confirm);
                  setConfirm(null);
                }}
              >
                Confirm {confirm === "stop" ? "Stop" : "Start"}
              </Button>
            </span>
          </div>
        ) : (
          <div className="flex gap-2">
            {view.showStart && (
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setConfirm("start")}>
                <Dot colour={COLOURS.run} /> Start{runTime ? ` · ${fmtNum(runTime.minutes, 0)} min` : ""}
              </Button>
            )}
            {view.showStop && (
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setConfirm("stop")}>
                <Dot colour={COLOURS.halt} /> Stop
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// -- tanks ----------------------------------------------------------------------

const BAND_LOOK: Record<Band, { colour: string; label: string }> = {
  ok: { colour: COLOURS.water, label: "OK" },
  low: { colour: COLOURS.low, label: "Low" },
  critical: { colour: COLOURS.critical, label: "Critical" },
  fault: { colour: COLOURS.none, label: "Sensor fault" },
  nodata: { colour: COLOURS.none, label: "No reading yet" },
};

function TankGraphic({ pct, colour, dim }: { pct: number | null; colour: string; dim: boolean }) {
  const h = 104;
  const fill = pct == null ? 0 : (pct / 100) * h;
  const top = 8 + h - fill;
  const id = `tank${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 72 120" className="h-[120px] w-[72px] shrink-0" aria-hidden>
      <defs>
        <clipPath id={id}>
          <rect x="6" y="8" width="60" height={h} rx="10" />
        </clipPath>
        <linearGradient id={`${id}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={colour} stopOpacity="0.95" />
          <stop offset="1" stopColor={colour} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="60" height={h} rx="10" fill="var(--muted)" />
      <g clipPath={`url(#${id})`} opacity={dim ? 0.45 : 1}>
        {pct != null && (
          <>
            <rect x="0" y={top + 3} width="72" height={fill + 4} fill={`url(#${id}-g)`} />
            <g className="mait-wave">
              <path
                d={`M0 ${top + 3} q 9 -5 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0 V ${top + 8} H 0 Z`}
                fill={colour}
                opacity="0.95"
              />
            </g>
          </>
        )}
      </g>
      {[25, 50, 75].map((m) => (
        <line key={m} x1="56" x2="66" y1={8 + h - (m / 100) * h} y2={8 + h - (m / 100) * h} stroke="var(--muted-foreground)" strokeOpacity="0.45" strokeWidth="1" />
      ))}
      <rect x="6" y="8" width="60" height={h} rx="10" fill="none" stroke="var(--border)" strokeWidth="2" />
    </svg>
  );
}

export function TankCard({
  title,
  subtitle,
  view,
  link,
  stale,
  lastHeard,
  now,
}: {
  title: string;
  subtitle?: string;
  view: TankView;
  link?: LinkView;
  stale: boolean;
  lastHeard?: number;
  now: number;
}) {
  const look = BAND_LOOK[view.band];
  return (
    <Card className="flex flex-col gap-3 p-4">
      <CardHeader title={title} subtitle={subtitle} right={<LinkBadge link={link} now={now} />} />
      <div className="flex items-center gap-4">
        <TankGraphic pct={view.pct} colour={look.colour} dim={stale} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="text-3xl font-semibold leading-none tabular-nums" style={{ color: view.pct == null ? "var(--muted-foreground)" : undefined }}>
            {view.pct == null ? "—" : `${fmtNum(view.pct, 0)}`}
            {view.pct != null && <span className="ml-0.5 text-base font-normal text-muted-foreground">%</span>}
          </div>
          <div>
            <Pill colour={look.colour} soft>
              {look.label}
            </Pill>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {view.level != null ? `${fmtNum(view.level, view.levelPrecision)} ${view.levelUnits}` : view.band === "fault" ? "" : "No level yet"}
            {view.volume != null && ` · ${fmtNum(view.volume, 0)} ${view.volumeUnits ?? ""}`}
          </div>
          {view.faultText && <div className="text-[11px] leading-snug text-muted-foreground">{view.faultText}</div>}
          {stale && <StaleNote ts={lastHeard} now={now} />}
        </div>
      </div>
    </Card>
  );
}

// -- flow -----------------------------------------------------------------------

export function FlowCard({
  title,
  subtitle,
  view,
  link,
  stale,
  lastHeard,
  now,
}: {
  title: string;
  subtitle?: string;
  view: FlowView;
  link?: LinkView;
  stale: boolean;
  lastHeard?: number;
  now: number;
}) {
  const flowing = view.flowing === true || (view.rate != null && view.rate > 0);
  const colour = view.faultText ? COLOURS.none : flowing ? COLOURS.flow : COLOURS.idle;
  const frac = view.rate != null && view.rateMax ? Math.max(0, Math.min(1, view.rate / view.rateMax)) : flowing ? 1 : 0;
  const status = view.faultText ? "Sensor fault" : view.rate == null && view.flowing == null ? "No reading yet" : flowing ? "Flowing" : "No flow";
  return (
    <Card className="flex flex-col gap-3 p-4">
      <CardHeader title={title} subtitle={subtitle} right={<LinkBadge link={link} now={now} />} />
      <div className="flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold leading-none tabular-nums" style={{ color: view.rate == null ? "var(--muted-foreground)" : undefined }}>
          {fmtNum(view.rate, view.ratePrecision)}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{view.rateUnits}</span>
        </div>
        <Pill colour={colour} soft>
          {status}
        </Pill>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" title={view.rateMax ? `Scale 0 – ${view.rateMax} ${view.rateUnits}` : undefined}>
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${flowing && !stale ? "mait-flowing" : ""}`}
          style={{ width: `${Math.max(frac * 100, flowing ? 6 : 0)}%`, background: colour }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Today" value={fmtNum(view.today, view.volumePrecision)} unit={view.volumeUnits} />
        <Stat label="Yesterday" value={fmtNum(view.yesterday, view.volumePrecision)} unit={view.volumeUnits} />
        <Stat label="Total" value={fmtNum(view.total, view.volumePrecision)} unit={view.volumeUnits} />
      </div>
      {view.faultText && <div className="text-[11px] leading-snug text-muted-foreground">{view.faultText}</div>}
      {stale ? (
        <StaleNote ts={lastHeard} now={now} />
      ) : (
        <div className="text-[11px] text-muted-foreground">Last flowed {view.lastFlow ? fmtClock(view.lastFlow, now) : "—"}</div>
      )}
    </Card>
  );
}

// -- pivots ---------------------------------------------------------------------

function PivotDial({ angle, colour, running }: { angle: number | null; colour: string; running: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" aria-hidden>
      <circle cx="32" cy="32" r="28" fill={`color-mix(in oklab, ${colour} 10%, transparent)`} stroke="var(--border)" strokeWidth="2" />
      <text x="32" y="11" textAnchor="middle" fontSize="7" fill="var(--muted-foreground)">
        N
      </text>
      {angle != null && (
        <line
          x1="32"
          y1="32"
          x2={32 + 24 * Math.sin((angle * Math.PI) / 180)}
          y2={32 - 24 * Math.cos((angle * Math.PI) / 180)}
          stroke={colour}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}
      <circle cx="32" cy="32" r="3.5" fill={running ? colour : "var(--muted-foreground)"} />
    </svg>
  );
}

export function PivotCard({
  title,
  subtitle,
  view,
  link,
  stale,
  lastHeard,
  now,
}: {
  title: string;
  subtitle?: string;
  view: PivotView;
  link?: LinkView;
  stale: boolean;
  lastHeard?: number;
  now: number;
}) {
  const running = view.state === "running";
  const colour = view.safetyOk === false ? COLOURS.halt : running ? COLOURS.run : view.state === "stopped" ? COLOURS.idle : COLOURS.none;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <CardHeader title={title} subtitle={subtitle} right={<LinkBadge link={link} now={now} />} />
      <div className="flex items-center gap-4">
        <PivotDial angle={view.angle} colour={colour} running={running} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div>
            <Pill colour={view.pending ? COLOURS.pending : colour}>
              {view.pending && <Spinner className="h-3 w-3" />}
              {view.status}
            </Pill>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {view.heading ?? (view.angle != null ? `${fmtNum(view.angle, 0)}°` : "No position yet")}
            {view.speed != null && ` · ${fmtNum(view.speed, 0)} %`}
          </div>
          {view.safetyOk === false && (
            <div className="text-[11px] font-semibold" style={{ color: COLOURS.halt }}>
              Safety tripped
            </div>
          )}
          {stale && <StaleNote ts={lastHeard} now={now} />}
        </div>
      </div>
    </Card>
  );
}

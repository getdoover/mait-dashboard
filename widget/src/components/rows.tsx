import { useEffect, useState, type ReactNode } from "react";

import { fmtAgo, fmtClock, fmtDuration, fmtNum } from "../lib/format";
import type { Band, FlowView, LinkView, PivotView, PumpStatus, PumpView, RunTime, TankView } from "../lib/model";
import { Button, Cell, Dot, GridRow, NameCell, Num, Pill, Spinner, type Column } from "./ui";

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

// -- columns ----------------------------------------------------------------------
// The name column is the same fixed width in every section so the sections line up.

const name = (label: string): Column => ({ label, track: "min(220px, 40vw)" });
const num = (label: string, min = 84): Column => ({ label, track: `minmax(${min}px, 0.7fr)`, align: "end" });
const LINK: Column = { label: "Last heard", track: "minmax(120px, 0.8fr)" };
const withLink = (cols: Column[], showLink: boolean) => (showLink ? [...cols, LINK] : cols);

export const pumpColumns = (showLink: boolean): Column[] => [
  ...withLink(
    [name("Pump"), { label: "Status", track: "minmax(190px, 1.6fr)" }, num("Hours today"), num("Starts today"), num("Last started")],
    showLink,
  ),
  { label: "Control", track: "minmax(200px, 1fr)", align: "end" },
];

export const tankColumns = (showLink: boolean): Column[] =>
  withLink([name("Tank"), { label: "Level", track: "minmax(220px, 2fr)" }, { label: "Status", track: "minmax(110px, 0.8fr)" }, num("Reading", 96), num("Volume", 96)], showLink);

export const flowColumns = (showLink: boolean): Column[] =>
  withLink(
    [
      name("Flow meter"),
      { label: "Rate", track: "minmax(220px, 2fr)" },
      { label: "Status", track: "minmax(110px, 0.8fr)" },
      num("Today"),
      num("Yesterday"),
      num("Total"),
      num("Last flowed"),
    ],
    showLink,
  );

export const pivotColumns = (showLink: boolean): Column[] =>
  withLink(
    [name("Pivot"), { label: "Position", track: "minmax(190px, 1.6fr)" }, { label: "Status", track: "minmax(150px, 1fr)" }, num("Speed", 70), { label: "Safety", track: "minmax(90px, 0.7fr)" }],
    showLink,
  );

// -- shared cells -------------------------------------------------------------------

interface Freshness {
  link?: LinkView;
  stale: boolean;
  lastHeard?: number;
}

/** The device's radio link: a dot and when it was last heard; route and link success on hover. */
function LinkCell({ link, stale, lastHeard, now }: Freshness & { now: number }) {
  if (!link) return <Cell className="text-xs text-muted-foreground">—</Cell>;
  const title = [
    `Radio link: ${link.label}`,
    link.linkPct != null ? `Link success ${Math.round(link.linkPct)} %` : null,
    link.route ? `Route ${link.route}` : null,
    `Last heard ${fmtAgo(link.lastHeard, now)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const offline = link.status === "offline";
  return (
    <Cell title={title}>
      <span className="inline-flex max-w-full items-center gap-1.5 text-xs" style={{ color: stale && !offline ? COLOURS.low : undefined }}>
        <Dot colour={LINK_COLOUR[link.status]} />
        <span className={`truncate ${stale || offline ? "font-medium" : "text-muted-foreground"}`}>
          {offline ? `Offline · ${fmtAgo(lastHeard ?? link.lastHeard, now)}` : stale ? `Stale · ${fmtAgo(lastHeard, now)}` : fmtAgo(link.lastHeard, now)}
        </span>
      </span>
    </Cell>
  );
}

function Note({ colour, children }: { colour?: string; children: ReactNode }) {
  return colour ? (
    <div className="w-fit max-w-full rounded-md px-2.5 py-1 text-xs" style={{ color: colour, background: `color-mix(in oklab, ${colour} 12%, transparent)` }}>
      {children}
    </div>
  ) : (
    <div className="text-[11px] leading-snug text-muted-foreground">{children}</div>
  );
}

/** A horizontal fill bar with optional threshold ticks. */
function Bar({ frac, colour, dim, marks = [], animated = false, title }: { frac: number; colour: string; dim?: boolean; marks?: number[]; animated?: boolean; title?: string }) {
  return (
    <div className="relative h-2.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-muted" title={title}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${animated ? "mait-flowing" : ""}`}
        style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: colour, opacity: dim ? 0.45 : 1 }}
      />
      {marks.map((m) => (
        <span key={m} className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${m}%` }} />
      ))}
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: `color-mix(in oklab, ${colour} 15%, transparent)`, color: colour }}
    >
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`} style={{ animationDuration: "1.6s" }} fill="currentColor" aria-hidden>
        <circle cx="12" cy="12" r="2.4" />
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} transform={`rotate(${a} 12 12)`} d="M12 9.2c.6-2.6 2.3-5 5-5.6.6 1.6-.2 4.2-3 6.1-.6.4-1.3.4-2-.5Z" />
        ))}
      </svg>
    </span>
  );
}

export type SendState = { verb: "start" | "stop"; at: number; error?: string } | undefined;

export function PumpRow({
  title,
  subtitle,
  view,
  runTime,
  showLink,
  now,
  sending,
  onCommand,
  ...fresh
}: Freshness & {
  title: string;
  subtitle?: string;
  view: PumpView;
  runTime?: RunTime;
  showLink: boolean;
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
  if (!detail) detail = view.commandText ?? (view.status === "nodata" ? "No state reported yet" : undefined);

  const busy = !!awaitingTags;
  const minutes = runTime ? ` · ${fmtNum(runTime.minutes, 0)} min` : "";

  const notes = [
    view.warning && (
      <Note key="w" colour={COLOURS.pending}>
        {view.warning}
      </Note>
    ),
    sending?.error && (
      <Note key="e" colour={COLOURS.halt}>
        Couldn't send {sending.verb === "stop" ? "Stop" : "Start"}: {sending.error}
      </Note>
    ),
  ].filter(Boolean);

  return (
    <GridRow note={notes.length ? notes : undefined}>
      <NameCell title={title} subtitle={subtitle} accent={pillColour} />
      <Cell title={view.commandText}>
        <div className="flex items-center gap-2.5">
          <Impeller colour={pillColour} spinning={view.status === "running" || (view.status === "pending" && view.running === true)} />
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <Pill colour={pillColour}>
              {(view.status === "pending" || awaitingTags) && <Spinner className="h-3 w-3" />}
              {pillLabel}
            </Pill>
            {detail && <span className="max-w-full truncate text-[11px] text-muted-foreground">{detail}</span>}
          </div>
        </div>
      </Cell>
      <Cell align="end">
        <Num value={fmtNum(view.hoursToday, 1)} unit="h" />
      </Cell>
      <Cell align="end">
        <Num value={fmtNum(view.startsToday, 0)} />
      </Cell>
      <Cell align="end">
        <Num value={fmtClock(view.lastStarted, now)} />
      </Cell>
      {showLink && <LinkCell {...fresh} now={now} />}
      <Cell align="end">
        {confirm ? (
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={confirm === "stop" ? "stop" : "go"}
              title={confirm === "stop" ? "Stop this pump" : `Start this pump${minutes ? ` for${minutes.slice(2)}` : ""}`}
              onClick={() => {
                onCommand(confirm);
                setConfirm(null);
              }}
            >
              Confirm {confirm === "stop" ? "Stop" : `Start${minutes}`}
            </Button>
          </span>
        ) : (
          <span className="flex gap-2">
            {view.showStart && (
              <Button size="sm" disabled={busy} onClick={() => setConfirm("start")}>
                <Dot colour={COLOURS.run} /> Start{minutes}
              </Button>
            )}
            {view.showStop && (
              <Button size="sm" disabled={busy} onClick={() => setConfirm("stop")}>
                <Dot colour={COLOURS.halt} /> Stop
              </Button>
            )}
          </span>
        )}
      </Cell>
    </GridRow>
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

export function TankRow({
  title,
  subtitle,
  view,
  lowPct,
  criticalPct,
  showLink,
  now,
  ...fresh
}: Freshness & { title: string; subtitle?: string; view: TankView; lowPct: number; criticalPct: number; showLink: boolean; now: number }) {
  const look = BAND_LOOK[view.band];
  const alert = view.band === "low" || view.band === "critical" ? look.colour : undefined;
  return (
    <GridRow note={view.faultText ? <Note>{view.faultText}</Note> : undefined}>
      <NameCell title={title} subtitle={subtitle} accent={alert} />
      <Cell>
        <div className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-right text-lg font-semibold leading-none tabular-nums" style={{ color: view.pct == null ? "var(--muted-foreground)" : undefined }}>
            {view.pct == null ? "—" : fmtNum(view.pct, 0)}
            {view.pct != null && <span className="ml-0.5 text-xs font-normal text-muted-foreground">%</span>}
          </span>
          <Bar
            frac={(view.pct ?? 0) / 100}
            colour={look.colour}
            dim={fresh.stale}
            marks={[criticalPct, lowPct]}
            title={`Low ≤ ${lowPct} % · Critical ≤ ${criticalPct} %`}
          />
        </div>
      </Cell>
      <Cell>
        <Pill colour={look.colour} soft>
          {look.label}
        </Pill>
      </Cell>
      <Cell align="end">
        <Num value={view.level != null ? fmtNum(view.level, view.levelPrecision) : "—"} unit={view.levelUnits} />
      </Cell>
      <Cell align="end">
        <Num value={view.volume != null ? fmtNum(view.volume, 0) : "—"} unit={view.volumeUnits ?? undefined} />
      </Cell>
      {showLink && <LinkCell {...fresh} now={now} />}
    </GridRow>
  );
}

// -- flow -----------------------------------------------------------------------

export function FlowRow({ title, subtitle, view, showLink, now, ...fresh }: Freshness & { title: string; subtitle?: string; view: FlowView; showLink: boolean; now: number }) {
  const flowing = view.flowing === true || (view.rate != null && view.rate > 0);
  const colour = view.faultText ? COLOURS.none : flowing ? COLOURS.flow : COLOURS.idle;
  const frac = view.rate != null && view.rateMax ? view.rate / view.rateMax : flowing ? 1 : 0;
  const status = view.faultText ? "Sensor fault" : view.rate == null && view.flowing == null ? "No reading yet" : flowing ? "Flowing" : "No flow";
  return (
    <GridRow note={view.faultText ? <Note>{view.faultText}</Note> : undefined}>
      <NameCell title={title} subtitle={subtitle} />
      <Cell>
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-right text-lg font-semibold leading-none tabular-nums" style={{ color: view.rate == null ? "var(--muted-foreground)" : undefined }}>
            {fmtNum(view.rate, view.ratePrecision)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{view.rateUnits}</span>
          </span>
          <Bar
            frac={flowing ? Math.max(frac, 0.06) : frac}
            colour={colour}
            animated={flowing && !fresh.stale}
            title={view.rateMax ? `Scale 0 – ${view.rateMax} ${view.rateUnits}` : undefined}
          />
        </div>
      </Cell>
      <Cell>
        <Pill colour={colour} soft>
          {status}
        </Pill>
      </Cell>
      <Cell align="end">
        <Num value={fmtNum(view.today, view.volumePrecision)} unit={view.volumeUnits} />
      </Cell>
      <Cell align="end">
        <Num value={fmtNum(view.yesterday, view.volumePrecision)} unit={view.volumeUnits} />
      </Cell>
      <Cell align="end">
        <Num value={fmtNum(view.total, view.volumePrecision)} unit={view.volumeUnits} />
      </Cell>
      <Cell align="end">
        <Num value={view.lastFlow ? fmtClock(view.lastFlow, now) : "—"} />
      </Cell>
      {showLink && <LinkCell {...fresh} now={now} />}
    </GridRow>
  );
}

// -- pivots ---------------------------------------------------------------------

function PivotDial({ angle, colour, running }: { angle: number | null; colour: string; running: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
      <circle cx="32" cy="32" r="28" fill={`color-mix(in oklab, ${colour} 10%, transparent)`} stroke="var(--border)" strokeWidth="3" />
      <line x1="32" y1="4" x2="32" y2="10" stroke="var(--muted-foreground)" strokeWidth="3" strokeLinecap="round" />
      {angle != null && (
        <line
          x1="32"
          y1="32"
          x2={32 + 24 * Math.sin((angle * Math.PI) / 180)}
          y2={32 - 24 * Math.cos((angle * Math.PI) / 180)}
          stroke={colour}
          strokeWidth="5"
          strokeLinecap="round"
        />
      )}
      <circle cx="32" cy="32" r="5" fill={running ? colour : "var(--muted-foreground)"} />
    </svg>
  );
}

export function PivotRow({ title, subtitle, view, showLink, now, ...fresh }: Freshness & { title: string; subtitle?: string; view: PivotView; showLink: boolean; now: number }) {
  const running = view.state === "running";
  const colour = view.safetyOk === false ? COLOURS.halt : running ? COLOURS.run : view.state === "stopped" ? COLOURS.idle : COLOURS.none;
  return (
    <GridRow>
      <NameCell title={title} subtitle={subtitle} accent={view.safetyOk === false ? COLOURS.halt : undefined} />
      <Cell>
        <div className="flex items-center gap-2.5">
          <PivotDial angle={view.angle} colour={colour} running={running} />
          <span className="truncate text-sm tabular-nums" style={{ color: view.angle == null && !view.heading ? "var(--muted-foreground)" : undefined }}>
            {view.heading ?? (view.angle != null ? `${fmtNum(view.angle, 0)}°` : "No position yet")}
          </span>
        </div>
      </Cell>
      <Cell title={view.commandText}>
        <Pill colour={view.pending ? COLOURS.pending : colour}>
          {view.pending && <Spinner className="h-3 w-3" />}
          {view.status}
        </Pill>
      </Cell>
      <Cell align="end">
        <Num value={fmtNum(view.speed, 0)} unit="%" />
      </Cell>
      <Cell>
        {view.safetyOk == null ? (
          <span className="text-sm text-muted-foreground">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: view.safetyOk ? undefined : COLOURS.halt }}>
            <Dot colour={view.safetyOk ? COLOURS.run : COLOURS.halt} /> {view.safetyOk ? "OK" : "Tripped"}
          </span>
        )}
      </Cell>
      {showLink && <LinkCell {...fresh} now={now} />}
    </GridRow>
  );
}

import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useInRouterContext } from "react-router";

// Controls styled after the host site's shadcn components (its CSS variables
// carry the theme), written locally so the bundle stays React-only.

const FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-xl border border-solid border-border bg-card text-card-foreground shadow-xs ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Dot({ colour, size = 8, pulse = false, title }: { colour: string; size?: number; pulse?: boolean; title?: string }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} title={title}>
      {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: colour }} />}
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, background: colour }} />
    </span>
  );
}

export function Pill({ colour, children, soft = false }: { colour: string; children: ReactNode; soft?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold"
      style={
        soft
          ? { color: colour, background: `color-mix(in oklab, ${colour} 14%, transparent)` }
          : { color: "#fff", background: colour }
      }
    >
      {children}
    </span>
  );
}

type ButtonVariant = "outline" | "go" | "stop" | "ghost";

export function Button({
  children,
  onClick,
  variant = "outline",
  disabled,
  title,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  title?: string;
  size?: "md" | "sm";
  className?: string;
}) {
  const styles: Record<ButtonVariant, string> = {
    outline: "border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
    ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
    go: "border-transparent bg-run text-white hover:bg-run/90",
    stop: "border-transparent bg-halt text-white hover:bg-halt/90",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex ${size === "sm" ? "h-8 px-3" : "h-9 px-3.5"} cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-solid text-[13px] font-medium shadow-xs transition-colors disabled:cursor-default disabled:opacity-50 ${FOCUS} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Message({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-solid border-border p-4 text-center text-sm text-muted-foreground">{children}</div>;
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// -- grid sections ----------------------------------------------------------------
// Each section is one table: a header row, then a row per item. Every row is its
// own CSS grid on the section's shared column template, so columns line up down
// the section. Below the template's minimum width the table scrolls sideways
// with the first (name) column pinned.

export interface Column {
  label: string;
  /** A grid track. Its first px value is the column's minimum width. */
  track: string;
  align?: "end";
}

const ROW = "grid items-center gap-x-4 gap-y-1.5 px-4";
const GAP_X = 16;
const PAD_X = 32;

const minWidthOf = (columns: Column[]) =>
  columns.reduce((sum, c) => sum + Number(/(\d+)px/.exec(c.track)?.[1] ?? 0), 0) + GAP_X * (columns.length - 1) + PAD_X;

/** The pinned first cell of a row; `accent` draws a status stripe down its left edge. */
const FIRST = "sticky left-0 z-[1] -ml-4 self-stretch bg-card pl-4 flex flex-col justify-center min-w-0";

export function GridSection({ title, aside, columns, children }: { title: string; aside?: ReactNode; columns: Column[]; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div
            role="table"
            aria-label={title}
            style={{ minWidth: minWidthOf(columns), ["--mait-cols" as string]: columns.map((c) => c.track).join(" ") }}
          >
            <div role="row" className={`${ROW} py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground`} style={{ gridTemplateColumns: "var(--mait-cols)" }}>
              {columns.map((c, i) => (
                <div key={c.label} role="columnheader" className={`${i === 0 ? FIRST : "truncate"} ${c.align === "end" ? "text-right" : ""}`}>
                  {c.label}
                </div>
              ))}
            </div>
            {children}
          </div>
        </div>
      </Card>
    </section>
  );
}

/** One item's row. `note` renders under the row, from the second column across. */
export function GridRow({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div
      role="row"
      className={`${ROW} border-solid border-border py-2.5`}
      // Explicit widths: without preflight a bare border-t leaves the other sides at "medium".
      style={{ gridTemplateColumns: "var(--mait-cols)", borderWidth: "1px 0 0 0" }}
    >
      {children}
      {note && (
        <div className="flex flex-col gap-1" style={{ gridColumn: "2 / -1" }}>
          {note}
        </div>
      )}
    </div>
  );
}

/** A link to another page of the host site: a router link inside the site, a plain link otherwise. */
export function SiteLink({ to, className, title, children }: { to: string; className?: string; title?: string; children: ReactNode }) {
  return useInRouterContext() ? (
    <Link to={to} className={className} title={title}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className} title={title}>
      {children}
    </a>
  );
}

/** The row's name cell: title over subtitle, pinned while the table scrolls. `to` links the title to the item's device page. */
export function NameCell({ title, subtitle, accent, to }: { title: string; subtitle?: string; accent?: string; to?: string }) {
  return (
    <div role="cell" className={FIRST} style={accent ? { boxShadow: `inset 3px 0 0 ${accent}` } : undefined}>
      {to ? (
        <SiteLink
          to={to}
          title={`Open ${title}'s device page`}
          className={`block truncate text-sm font-semibold leading-tight text-foreground no-underline decoration-1 underline-offset-2 hover:underline ${FOCUS} rounded-sm`}
        >
          {title}
        </SiteLink>
      ) : (
        <div className="truncate text-sm font-semibold leading-tight" title={title}>
          {title}
        </div>
      )}
      {subtitle && (
        <div className="mt-0.5 truncate text-xs text-muted-foreground" title={subtitle}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function Cell({ children, align, className = "", title }: { children: ReactNode; align?: "end"; className?: string; title?: string }) {
  return (
    <div role="cell" title={title} className={`min-w-0 ${align === "end" ? "flex justify-end text-right" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** A modal dialog over the whole page. Escape or a click outside closes it. */
export function Dialog({ title, description, onClose, children }: { title: string; description?: ReactNode; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (!panel.current?.contains(e.target as Node)) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-solid border-border bg-card p-5 text-card-foreground shadow-lg"
      >
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {title}
        </h2>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A number with its unit, right-aligned in its column. */
export function Num({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="truncate text-sm font-medium tabular-nums">
      {value}
      {unit && value !== "—" && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
    </span>
  );
}

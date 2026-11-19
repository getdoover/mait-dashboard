import type { CSSProperties, ReactNode } from "react";

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
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  title?: string;
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
      className={`inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-solid px-3.5 text-[13px] font-medium shadow-xs transition-colors disabled:cursor-default disabled:opacity-50 ${FOCUS} ${styles[variant]} ${className}`}
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

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))" }}>
        {children}
      </div>
    </section>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums">
        {value}
        {unit && value !== "—" && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "./icon";
import { displayStatus, STATUS_LABEL } from "@/lib/quote-state";
import type { Quote, QuoteStatus } from "@/lib/db/types";

/**
 * The prototype's primitives, as real components.
 *
 * Class names are unchanged from `design-reference/quoting-tool/app/primitives.jsx`
 * so the ported stylesheet applies without churn. What changed: these are typed,
 * they are ES modules rather than globals hung off `window`, and the ones that
 * hold state say so.
 */

// ── Buttons ────────────────────────────────────────────────────────────────

type ButtonVariant = "brand" | "outline" | "ghost" | "subtle" | "danger";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm";
  icon?: string;
  iconRight?: string;
}

export function Button({
  variant = "outline",
  size,
  icon,
  iconRight,
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = ["btn", `btn--${variant}`, size ? `btn--${size}` : "", className]
    .filter(Boolean)
    .join(" ");
  const iconSize = size === "sm" ? 14 : 15;
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  );
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  size?: number;
}

export function IconButton({
  icon,
  size = 16,
  className = "",
  title,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`icon-btn ${className}`}
      aria-label={rest["aria-label"] ?? title ?? icon}
      title={title}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

// ── Status ─────────────────────────────────────────────────────────────────

const PILL_CLASS: Record<QuoteStatus, string> = {
  draft: "draft",
  sent: "sent",
  viewed: "viewed",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  superseded: "superseded",
};

export function StatusPill({ status }: { status: QuoteStatus }) {
  return <span className={`pill pill--${PILL_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

/** Pill for a whole quote — resolves `sent` + a view into `viewed` for you. */
export function QuoteStatusPill({
  quote,
}: {
  quote: Pick<Quote, "status" | "viewed_at">;
}) {
  return <StatusPill status={displayStatus(quote)} />;
}

// ── Form fields ────────────────────────────────────────────────────────────

export function Field({
  label,
  hint,
  required,
  children,
  style,
  className = "",
}: {
  label?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <label className={`field ${className}`} style={style}>
      {label && (
        <span className="field__label">
          {label}
          {required && <span className="req">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`select ${className}`} {...props}>
      {children}
    </select>
  );
}

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  valueCents: number | null;
  onChangeCents: (cents: number) => void;
}

/**
 * Dollars in the field, cents in the model.
 *
 * The text is held locally so a half-typed "12." survives a keystroke. Parsing
 * happens on every change, but the parsed value only ever leaves as an integer
 * number of cents — the float never reaches storage.
 */
export function MoneyInput({ valueCents, onChangeCents, className = "", ...rest }: MoneyInputProps) {
  const [text, setText] = useState(valueCents != null ? String(valueCents / 100) : "");

  useEffect(() => {
    setText(valueCents != null ? String(valueCents / 100) : "");
  }, [valueCents]);

  return (
    <div className="input-prefix">
      <span>$</span>
      <input
        className={`input ${className}`}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          setText(raw);
          const parsed = Number.parseFloat(raw);
          onChangeCents(Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0);
        }}
        {...rest}
      />
    </div>
  );
}

// ── Toggle / checkbox ──────────────────────────────────────────────────────

export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${on ? "is-on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="toggle__track" />
      {label && <span className="toggle__label">{label}</span>}
    </button>
  );
}

export function Checkbox({
  on,
  onChange,
  children,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      className={`check ${on ? "is-on" : ""}`}
      onClick={() => onChange(!on)}
    >
      <span className="check__box">
        <Icon name="check" size={13} strokeWidth={3} />
      </span>
      <span className="check__text">{children}</span>
    </button>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────

export function Card({
  children,
  padding,
  className = "",
  style,
}: {
  children: ReactNode;
  padding?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card ${padding ? "card--p" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  crumbs,
  title,
  description,
  actions,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header>
      {crumbs && crumbs.length > 0 && (
        <nav className="crumb" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`}>
              {c.href ? (
                <a href={c.href}>{c.label}</a>
              ) : (
                <span className={i === crumbs.length - 1 ? "current" : ""}>{c.label}</span>
              )}
              {i < crumbs.length - 1 && <span className="sep">›</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="page-head">
        <div className="page-head__title">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>;
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
}: {
  icon: string;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={24} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions}
    </div>
  );
}

/**
 * Marks a figure the client never sees. Used beside margin everywhere it appears
 * on screen — the whole cost-in/margin-out model depends on the operator knowing
 * at a glance which numbers are internal.
 */
export function InternalBadge() {
  return (
    <span
      className="int-badge"
      title="Internal only — the client PDF shows sell prices; your margin is never printed."
    >
      <Icon name="eye-off" size={10} strokeWidth={2.4} />
      internal
    </span>
  );
}

"use client";

import type { ReactNode } from "react";

import { Icon } from "@/components/crm/icon";

/**
 * A numbered, collapsible step in the builder.
 *
 * The number turns into a tick once the step has what it needs, which is the
 * only progress indicator the form has — on a phone the sections are collapsed
 * and an operator standing on a roof needs to see at a glance what is still
 * outstanding.
 */
export function Section({
  id,
  num,
  title,
  small,
  right,
  complete,
  optional,
  open,
  onToggle,
  children,
}: {
  id: string;
  num: string;
  title: string;
  small?: string;
  right?: ReactNode;
  complete?: boolean;
  optional?: boolean;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className={`fieldset ${open ? "" : "is-closed"}`}>
      <div
        className="fieldset__head fieldset__head--btn"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(id);
          }
        }}
      >
        <span className={`fieldset__num ${complete ? "is-done" : ""}`}>
          {complete ? <Icon name="check" size={12} strokeWidth={3} /> : num}
        </span>
        <div className="fieldset__title">
          {title}
          {small && <small>{small}</small>}
        </div>
        {right && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto" }}>
            {right}
          </div>
        )}
        {optional && !complete && <span className="fieldset__opt">optional</span>}
        <span className="fieldset__chev">
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
      <div className="fieldset__body">{children}</div>
    </div>
  );
}

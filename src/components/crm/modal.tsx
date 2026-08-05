"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./ui";

/**
 * A dialog that closes on Escape and on a backdrop click, and returns focus to
 * whatever opened it. The prototype had the Escape handler but no focus
 * management — on a page this dense, losing your place on close is worse than it
 * sounds.
 */
export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  maxWidth,
  sheet,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
  /** Bottom sheet on small screens — used for the price book picker. */
  sheet?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);

    // A dialog over a scrolling list must not scroll the list behind it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      restoreTo.current?.focus?.();
    };
  }, [close]);

  return (
    <div className={`scrim ${sheet ? "scrim--sheet" : ""}`} onClick={close}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={`modal ${sheet ? "modal--sheet" : ""}`}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <div>
            <div className="modal__title">{title}</div>
            {sub && <div className="modal__sub">{sub}</div>}
          </div>
          <IconButton icon="x" title="Close" onClick={close} />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

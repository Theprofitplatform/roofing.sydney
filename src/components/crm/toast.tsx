"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";

export type ToastKind = "success" | "info" | "warning" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  msg: string;
  kind: ToastKind;
  icon: string;
  action?: ToastAction;
}

export type PushToast = (
  msg: string,
  kind?: ToastKind,
  icon?: string,
  action?: ToastAction,
) => void;

const ToastCtx = createContext<PushToast>(() => {});

const DEFAULT_ICON: Record<ToastKind, string> = {
  success: "check-circle",
  info: "info",
  warning: "alert-triangle",
  error: "alert-triangle",
};

/** A toast carrying an Undo stays longer — you have to read it before you act. */
const DWELL_MS = 3200;
const DWELL_WITH_ACTION_MS = 6500;

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback<PushToast>(
    (msg, kind = "success", icon, action) => {
      // A counter rather than Math.random: ids must be stable across a server
      // render and its hydration, and two toasts fired in the same tick must not
      // be able to collide.
      seq.current += 1;
      const id = `t${seq.current}`;
      setToasts((current) => [
        ...current,
        { id, msg, kind, icon: icon ?? DEFAULT_ICON[kind], action },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), action ? DWELL_WITH_ACTION_MS : DWELL_MS),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <Icon name={t.icon} size={17} /> {t.msg}
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): PushToast {
  return useContext(ToastCtx);
}

"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState({ kind: "sending" });

    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await getSupabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    setState(error ? { kind: "error", message: error.message } : { kind: "sent" });
  };

  if (state.kind === "sent") {
    return (
      <div className="crm-login__done" role="status">
        <strong>Check your inbox.</strong>
        <span>We sent a sign-in link to {email}. It expires in an hour.</span>
      </div>
    );
  }

  return (
    <form className="crm-login__form" onSubmit={submit}>
      <label className="crm-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@roofing.sydney"
          autoComplete="email"
          required
          autoFocus
        />
      </label>

      <button type="submit" className="crm-btn" disabled={state.kind === "sending"}>
        {state.kind === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>

      {state.kind === "error" && (
        <p className="crm-login__error" role="alert">{state.message}</p>
      )}
    </form>
  );
}

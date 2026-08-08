"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { safeNextPath } from "@/lib/safe-next-path";

type State = { kind: "idle" } | { kind: "signing-in" } | { kind: "error"; message: string };

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setState({ kind: "signing-in" });

    const { error } = await getSupabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // GoTrue answers "Invalid login credentials" for both a wrong password
      // and an unknown address, which is what we want — surfacing which one
      // failed would confirm to a stranger that an account exists.
      setState({ kind: "error", message: error.message });
      setPassword("");
      return;
    }

    // The session cookie is set by the browser client, but the server
    // components that render the destination were already rendered without it.
    // refresh() re-runs them so the operator does not land on a signed-out
    // shell and get bounced straight back here by middleware.
    router.replace(next);
    router.refresh();
  };

  const busy = state.kind === "signing-in";

  return (
    <form className="crm-login__form" onSubmit={submit}>
      <label className="crm-field">
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@roofing.sydney"
          autoComplete="username"
          required
          autoFocus
          disabled={busy}
        />
      </label>

      <label className="crm-field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={busy}
        />
      </label>

      <button type="submit" className="crm-btn" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {state.kind === "error" && (
        <p className="crm-login__error" role="alert">{state.message}</p>
      )}
    </form>
  );
}

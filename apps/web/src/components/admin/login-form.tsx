"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/admin/actions";

const initial: LoginState = { error: null, email: "" };

/**
 * A real `<form action>` (not an onSubmit handler): it POSTs the password even if the page's JavaScript has
 * not finished loading. A handler that is not attached yet would let the browser submit the form as a GET,
 * which puts the password in the address bar, the browser history and the server logs.
 */
export function LoginForm() {
  // The email comes back in the state: React clears the boxes after every submit, and a typo in the password
  // should not cost the owner the email they typed.
  const [state, formAction, busy] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="mx-auto mt-10 flex w-full max-w-sm flex-col gap-3 border border-line bg-surface p-5">
      <h1 className="text-lg font-bold text-brand">Admin sign-in</h1>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="username" defaultValue={state.email} autoFocus className="border border-line bg-white px-3 py-2 font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input name="password" type="password" required autoComplete="current-password" className="border border-line bg-white px-3 py-2 font-normal" />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm font-semibold text-crimson">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

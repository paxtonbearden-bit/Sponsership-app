"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safe-redirect";

export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNextPath(next))}`,
      },
    });
    setStatus(error ? "error" : "sent");
  }

  if (status === "sent") {
    return (
      <p role="status" className="mt-6 rounded-lg border border-border bg-card p-4">
        Check your email at <strong>{email}</strong>. The link signs you in.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 h-12 w-full rounded-lg border border-border bg-card px-3 text-base"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="h-12 w-full cursor-pointer rounded-lg bg-primary font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-destructive">
          Something went wrong sending the link. Please try again.
        </p>
      )}
    </form>
  );
}

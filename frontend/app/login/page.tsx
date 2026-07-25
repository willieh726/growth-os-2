"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) { setError("Auth is not configured."); return; }
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.replace("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <form onSubmit={signIn}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight">⚡ Growth OS</div>
          <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
        </div>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <label className="mt-4 block text-sm font-medium text-gray-700">Password</label>
        <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy}
          className="mt-6 w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

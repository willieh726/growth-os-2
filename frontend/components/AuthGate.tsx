"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authEnabled, supabase } from "@/lib/supabase";

/** Client-side gate around the internal dashboard. Public pages (/a/[slug],
 *  /login) live outside this component and stay reachable. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(!authEnabled);

  useEffect(() => {
    if (!authEnabled || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace("/login");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (!ready) return <p className="p-8 text-gray-400">Checking sign-in…</p>;
  return <>{children}</>;
}

export function SignOutButton() {
  const router = useRouter();
  if (!authEnabled) return null;
  return (
    <button
      onClick={async () => { await supabase!.auth.signOut(); router.replace("/login"); }}
      className="mt-6 block w-full rounded-md px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100">
      Sign out
    </button>
  );
}

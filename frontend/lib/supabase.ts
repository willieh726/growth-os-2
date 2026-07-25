import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Auth is active only when Supabase env vars are configured (production).
 *  Local dev without them keeps working with the backend's AUTH_DISABLED. */
export const authEnabled = Boolean(url && anon);
export const supabase: SupabaseClient | null = authEnabled
  ? createClient(url!, anon!)
  : null;

import { supabase } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  get: <T>(p: string) => req<T>(p),
  post: <T>(p: string, body?: unknown) =>
    req<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    req<T>(p, { method: "PATCH", body: JSON.stringify(body) }),
};

export type Lead = {
  id: string; business_id: string; stage: string; name: string;
  industry: string; city: string | null; state: string; phone: string | null;
  contact_email: string | null; business_email: string | null;
  website_url: string | null; has_website: boolean;
  gbp_rating: number | null; gbp_review_count: number | null;
  opportunity_score: number | null; score_breakdown: Record<string, {points: number; max: number; reason: string}> | null;
  interaction_count: number; last_activity_at: string | null;
  interactions?: Interaction[];
  likely_fake_listing?: boolean;
};

export type Interaction = {
  id: string; type: string; channel: string | null; subject: string | null;
  body: string | null; occurred_at: string; created_by: string;
};

export type Business = {
  id: string; name: string; industry: string; city: string | null; state: string;
  phone: string | null; email: string | null; website_url: string | null;
  has_website: boolean; gbp_rating: number | null; gbp_review_count: number | null;
  opportunity_score: number | null;
  score_breakdown: Record<string, {points: number; max: number; reason: string}> | null;
  likely_fake_listing?: boolean;
};

export const STAGES = ["new","qualified","contacted","replied","meeting","proposal","won","lost"];
export const INDUSTRIES = ["tree_service","excavation","septic","concrete","hvac","plumbing","electrical","roofing","landscaping"];
export const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

export function scoreColor(n: number | null): string {
  if (n == null) return "bg-gray-200 text-gray-500";
  if (n >= 70) return "bg-red-100 text-red-700";      // hottest opportunity
  if (n >= 50) return "bg-orange-100 text-orange-700";
  if (n >= 30) return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-600";
}

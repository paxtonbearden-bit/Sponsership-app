import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: BYPASSES Row Level Security. Server code only, and only
// for things the browser must never do itself (payments, recap tokens, etc.).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

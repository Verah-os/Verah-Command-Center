import { createClient } from "@supabase/supabase-js";
import {
  checkWhatsAppReadiness,
  formatWhatsAppReadiness,
  type WhatsAppDatabaseReadiness,
} from "../services/whatsapp/readiness.ts";

const result = await checkWhatsAppReadiness(process.env, {
  async readDatabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) return null;
    const client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.rpc("whatsapp_readiness_snapshot");
    if (error) return null;
    return data as WhatsAppDatabaseReadiness;
  },
});

console.log(formatWhatsAppReadiness(result));
if (result.status !== "READY") process.exitCode = 1;

import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/services/supabase/server";
import type { PlatformSettingsSummary, SystemSetting } from "@/types/system-setting";

type SystemSettingRow = {
  id: string;
  category: string;
  key: string;
  value: string;
  description: string;
  is_secret: boolean;
  is_editable: boolean;
  created_at: string;
  updated_at: string;
};

const systemSettingColumns = "id,category,key,value,description,is_secret,is_editable,created_at,updated_at";

function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

function toSystemSetting(row: SystemSettingRow): SystemSetting {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    value: row.value,
    description: row.description,
    isSecret: row.is_secret,
    isEditable: row.is_editable,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listSystemSettings(): Promise<SystemSetting[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select(systemSettingColumns)
    .order("category", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    console.error("Failed to load system settings", error.message);
    return [];
  }

  return ((data ?? []) as SystemSettingRow[]).map(toSystemSetting);
}

export async function getPlatformSettingsSummary(): Promise<PlatformSettingsSummary> {
  const settings = await listSystemSettings();
  const findValue = (category: string, key: string) =>
    settings.find((setting) => setting.category === category && setting.key === key)?.value ?? "-";

  return {
    version: findValue("command_center", "version"),
    environment: findValue("runtime", "environment"),
    timezone: findValue("runtime", "timezone")
  };
}

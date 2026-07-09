import { SettingsModule } from "@/modules/settings/components/settings-module";
import { listSystemSettings } from "@/services/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; status?: "success" | "error" }>;
}) {
  const params = await searchParams;
  const settings = await listSystemSettings();

  return <SettingsModule feedback={{ message: params.message, status: params.status }} settings={settings} />;
}

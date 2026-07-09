import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { updateSystemSetting } from "@/services/settings";
import type { SystemSetting } from "@/types/system-setting";

type SettingsFeedback = {
  status?: "success" | "error";
  message?: string;
};

function SettingValue({ setting }: { setting: SystemSetting }) {
  if (setting.isSecret) {
    return <span className="font-medium">********</span>;
  }

  if (!setting.isEditable) {
    return <span className="font-medium">{setting.value}</span>;
  }

  return (
    <form action={updateSystemSetting} className="flex min-w-64 gap-2">
      <input name="id" type="hidden" value={setting.id} />
      <input
        className="h-9 min-w-0 flex-1 rounded-md border border-border px-3 text-sm"
        name="value"
        type="text"
        defaultValue={setting.value}
      />
      <Button type="submit" variant="secondary">
        Save
      </Button>
    </form>
  );
}

export function SettingsModule({ feedback, settings }: { feedback?: SettingsFeedback; settings: SystemSetting[] }) {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-sm text-muted-foreground">VERAH OS</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Configuracoes centrais da plataforma VERAH administradas pelo Command Center.
        </p>
      </section>

      {feedback?.status && feedback.message ? (
        <div
          className={
            feedback.status === "success"
              ? "rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">System Settings</h2>
        </CardHeader>
        <CardContent>
          {settings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma configuracao encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Categoria</th>
                    <th className="py-2 pr-3 font-medium">Chave</th>
                    <th className="py-2 pr-3 font-medium">Valor</th>
                    <th className="py-2 pr-3 font-medium">Descricao</th>
                    <th className="py-2 pr-3 font-medium">Editavel</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.id} className="border-b border-border last:border-0">
                      <td className="py-3 pr-3 font-medium">{setting.category}</td>
                      <td className="py-3 pr-3">{setting.key}</td>
                      <td className="py-3 pr-3">
                        <SettingValue setting={setting} />
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">{setting.description}</td>
                      <td className="py-3 pr-3">{setting.isEditable ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

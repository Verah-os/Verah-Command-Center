export type ModuleStatus = "ready" | "attention" | "empty" | "error";

export type CommandModule = {
  slug: string;
  title: string;
  description: string;
  owner: string;
  status: ModuleStatus;
  metrics: Array<{
    label: string;
    value: string;
  }>;
  primaryAction: string;
};

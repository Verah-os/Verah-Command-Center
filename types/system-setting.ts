export type SystemSetting = {
  id: string;
  category: string;
  key: string;
  value: string;
  description: string;
  isSecret: boolean;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSettingsSummary = {
  version: string;
  environment: string;
  timezone: string;
};

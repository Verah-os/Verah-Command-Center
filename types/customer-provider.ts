export type CustomerProviderProfile = {
  city: string;
  specialties: string[];
  status: "active" | "inactive" | "suspended";
  rating: number | null;
};

export type CustomerVehicle = {
  id: string;
  ownerId: string;
  nickname: string | null;
  brand: string;
  model: string;
  year: number | null;
  plate: string | null;
  state: string | null;
  city: string | null;
  currentMileage: number | null;
  lastServiceAt: string | null;
  nextServiceDate: string | null;
  nextServiceMileage: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

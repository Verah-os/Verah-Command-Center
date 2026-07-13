export const vehicleCatalog = {
  Volkswagen: [
    "Fox",
    "Gol",
    "Polo",
    "Virtus",
    "Nivus",
    "T-Cross",
    "Saveiro",
    "Voyage",
    "Taos",
    "Tiguan",
  ],
  Chevrolet: [
    "Onix",
    "Onix Plus",
    "Tracker",
    "Spin",
    "S10",
    "Montana",
    "Cruze",
    "Cobalt",
  ],
  Fiat: [
    "Argo",
    "Mobi",
    "Cronos",
    "Pulse",
    "Fastback",
    "Strada",
    "Toro",
    "Uno",
    "Palio",
  ],
  Ford: [
    "Ka",
    "Fiesta",
    "EcoSport",
    "Ranger",
    "Territory",
    "Maverick",
    "Focus",
  ],
  Toyota: [
    "Corolla",
    "Corolla Cross",
    "Yaris",
    "Hilux",
    "SW4",
    "Etios",
    "RAV4",
  ],
  Honda: ["Civic", "City", "Fit", "HR-V", "WR-V", "CR-V"],
  Hyundai: ["HB20", "HB20S", "Creta", "Tucson", "ix35", "Azera"],
  Renault: ["Kwid", "Sandero", "Logan", "Duster", "Captur", "Oroch", "Kardian"],
  Jeep: ["Renegade", "Compass", "Commander", "Wrangler", "Gladiator"],
  Nissan: ["Kicks", "Versa", "Sentra", "Frontier", "March", "Livina"],
  Peugeot: ["208", "2008", "3008", "Partner", "Expert"],
  Citroën: ["C3", "C4 Cactus", "Aircross", "Basalt", "Jumpy"],
  BMW: ["Série 1", "Série 3", "Série 5", "X1", "X3", "X5"],
  "Mercedes-Benz": ["Classe A", "Classe C", "Classe E", "GLA", "GLC", "GLE"],
  Audi: ["A3", "A4", "A5", "Q3", "Q5", "Q7"],
  Volvo: ["EX30", "XC40", "XC60", "XC90", "S60"],
} as const;

export type VehicleBrand = keyof typeof vehicleCatalog;
export const vehicleBrands = Object.keys(vehicleCatalog) as VehicleBrand[];
export function isVehicleBrand(value: string): value is VehicleBrand {
  return vehicleBrands.includes(value as VehicleBrand);
}
export function modelsForBrand(brand: string): readonly string[] {
  return isVehicleBrand(brand) ? vehicleCatalog[brand] : [];
}
export function isValidVehicle(brand: string, model: string) {
  return isVehicleBrand(brand) && modelsForBrand(brand).includes(model);
}

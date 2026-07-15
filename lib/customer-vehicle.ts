import type { CustomerVehicle } from "@/types/customer-vehicle";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
});

export function maskPlate(plate: string | null) {
  if (!plate) return "Não informada";
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length < 4) return "***";
  const prefix = normalized.slice(0, Math.min(4, normalized.length - 3));
  return `${prefix}${normalized.length > 4 ? "-" : ""}***`;
}

export function vehicleName(vehicle: CustomerVehicle) {
  return `${vehicle.brand} ${vehicle.model}${vehicle.year ? ` · ${vehicle.year}` : ""}`;
}

export function nextCareMessages(vehicle: CustomerVehicle) {
  const messages: string[] = [];
  if (vehicle.nextServiceDate) {
    messages.push(
      `Revisão informada para ${dateFormatter.format(new Date(`${vehicle.nextServiceDate}T12:00:00-03:00`))}`,
    );
  }
  if (vehicle.nextServiceMileage !== null) {
    messages.push(
      `Próximo cuidado aos ${vehicle.nextServiceMileage.toLocaleString("pt-BR")} km`,
    );
  }
  if (!messages.length && vehicle.currentMileage === null) {
    messages.push("Atualize a quilometragem para receber lembretes melhores");
  }
  return messages;
}

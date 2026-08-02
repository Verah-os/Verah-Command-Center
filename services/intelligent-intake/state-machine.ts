import { invalidAnswer, questionForStep, resumedQuestion } from "./questions.ts";
import type {
  IntakeCollectedData,
  IntakeContext,
  IntakeStatus,
  IntakeStep,
  IntakeTransition,
} from "./types.ts";

const terminal = new Set<IntakeStatus>(["completed", "cancelled", "abandoned"]);

export function transitionIntake(context: IntakeContext): IntakeTransition {
  if (terminal.has(context.status)) {
    throw new Error("intake_session_terminal");
  }
  const raw = context.messageBody?.trim() ?? "";
  if (isCancellation(raw)) {
    return result(context, true, "cancelled", "completed", context.collectedData,
      "A sessão foi cancelada. Quando precisar, envie uma nova mensagem para recomeçar.", false);
  }

  if (context.currentStep === "welcome") {
    const hasKnownName = context.customerDisplayName !== "Cliente WhatsApp";
    if (hasKnownName) {
      return move(
        context,
        "collecting_vehicle",
        context.vehicles.length ? "vehicle_choice" : "vehicle_brand",
        { ...context.collectedData, customerName: context.customerDisplayName },
      );
    }
    return move(context, "started", "customer_name");
  }

  if (!raw || context.messageType !== "text") return invalid(context);
  const data = structuredClone(context.collectedData);

  switch (context.currentStep) {
    case "customer_name": {
      const name = shortText(raw, 2, 120);
      if (!name) return invalid(context);
      data.customerName = name;
      return move(context, "collecting_vehicle", context.vehicles.length ? "vehicle_choice" : "vehicle_brand", data, undefined, name);
    }
    case "vehicle_choice": {
      if (/^(novo|nova|new)$/i.test(raw)) {
        data.vehicleMode = "new";
        data.vehicle = {};
        return move(context, "collecting_vehicle", "vehicle_brand", data);
      }
      const index = Number(raw) - 1;
      const vehicle = Number.isInteger(index) ? context.vehicles[index] : undefined;
      if (!vehicle) return invalid(context);
      data.vehicleMode = "existing";
      data.vehicle = {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year ?? undefined,
        plate: vehicle.plate,
      };
      return move(context, "collecting_mileage", "mileage", data, vehicle.id);
    }
    case "vehicle_brand": {
      const brand = shortText(raw, 2, 80);
      if (!brand) return invalid(context);
      data.vehicleMode = "new";
      data.vehicle = { ...(data.vehicle ?? {}), brand };
      return move(context, "collecting_vehicle", "vehicle_model", data);
    }
    case "vehicle_model": {
      const model = shortText(raw, 1, 100);
      if (!model) return invalid(context);
      data.vehicle = { ...(data.vehicle ?? {}), model };
      return move(context, "collecting_vehicle", "vehicle_year", data);
    }
    case "vehicle_year": {
      const year = Number(raw);
      if (!/^\d{4}$/.test(raw) || year < 1950 || year > new Date().getFullYear() + 1) return invalid(context);
      data.vehicle = { ...(data.vehicle ?? {}), year };
      return move(context, "collecting_vehicle", "vehicle_plate", data);
    }
    case "vehicle_plate": {
      if (/^(pular|nao informar|não informar|sem placa)$/i.test(raw)) {
        data.vehicle = { ...(data.vehicle ?? {}), plate: null };
      } else {
        const plate = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (plate.length < 7 || plate.length > 8) return invalid(context);
        data.vehicle = { ...(data.vehicle ?? {}), plate };
      }
      return move(context, "collecting_mileage", "mileage", data);
    }
    case "mileage": {
      const digits = raw.replace(/[^0-9]/g, "");
      if (!digits) return invalid(context);
      const mileage = Number(digits);
      if (!Number.isSafeInteger(mileage) || mileage < 0 || mileage > 2_000_000) return invalid(context);
      data.mileage = mileage;
      return move(context, "collecting_symptoms", "symptom", data);
    }
    case "symptom": {
      const symptom = shortText(raw, 5, 1_000);
      if (!symptom) return invalid(context);
      data.symptom = symptom;
      return move(context, "collecting_conditions", "conditions", data);
    }
    case "conditions": {
      const conditions = shortText(raw, 2, 600);
      if (!conditions) return invalid(context);
      data.conditions = conditions;
      return move(context, "collecting_conditions", "frequency", data);
    }
    case "frequency": {
      const frequency = shortText(raw, 2, 300);
      if (!frequency) return invalid(context);
      data.frequency = frequency;
      return move(context, "collecting_conditions", "dashboard_lights", data);
    }
    case "dashboard_lights": {
      const dashboardLights = shortText(raw, 2, 300);
      if (!dashboardLights) return invalid(context);
      data.dashboardLights = dashboardLights;
      return move(context, "collecting_conditions", "operating_condition", data);
    }
    case "operating_condition": {
      const operatingCondition = shortText(raw, 2, 500);
      if (!operatingCondition) return invalid(context);
      data.operatingCondition = operatingCondition;
      return move(context, "collecting_risk", "urgency", data);
    }
    case "urgency": {
      const urgency = parseUrgency(raw);
      if (!urgency) return invalid(context);
      data.urgency = urgency;
      return needsLocation(data)
        ? move(context, "collecting_risk", "location", data)
        : move(context, "waiting_customer", "confirmation", data);
    }
    case "location": {
      const location = shortText(raw, 2, 160);
      if (!location) return invalid(context);
      data.location = location;
      return move(context, "waiting_customer", "confirmation", data);
    }
    case "confirmation": {
      if (/^(sim|s|confirmo|pode criar)$/i.test(raw)) {
        return result(context, true, "ready", "completed", data,
          "Atendimento criado. O Concierge VERAH fará a revisão das informações e dos sinais de risco.", true);
      }
      if (/^(nao|não|n)$/i.test(raw)) {
        return move(context, "collecting_symptoms", "symptom", data);
      }
      return invalid(context);
    }
    case "completed":
      throw new Error("intake_session_terminal");
  }
}

function move(
  context: IntakeContext,
  status: IntakeStatus,
  step: IntakeStep,
  data = context.collectedData,
  vehicleId?: string | null,
  customerDisplayName?: string | null,
) {
  const response = context.resumed
    ? resumedQuestion(step, data, context.vehicles)
    : questionForStep(step, data, context.vehicles);
  return result(context, true, status, step, data, response, false, vehicleId, customerDisplayName);
}

function invalid(context: IntakeContext) {
  return result(context, false, context.status, context.currentStep, context.collectedData,
    invalidAnswer(context.currentStep), false);
}

function result(
  _context: IntakeContext,
  valid: boolean,
  nextStatus: IntakeStatus,
  nextStep: IntakeStep,
  collectedData: IntakeCollectedData,
  response: string,
  complete: boolean,
  vehicleId?: string | null,
  customerDisplayName?: string | null,
): IntakeTransition {
  return { valid, nextStatus, nextStep, collectedData, response, complete, vehicleId, customerDisplayName };
}

function shortText(value: string, minimum: number, maximum: number) {
  const normalized = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length >= minimum && normalized.length <= maximum ? normalized : null;
}

function parseUrgency(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/critica|critico|emergencia/.test(normalized)) return "critica" as const;
  if (/alta|urgente/.test(normalized)) return "alta" as const;
  if (/media|moderada/.test(normalized)) return "media" as const;
  if (/baixa|pouca/.test(normalized)) return "baixa" as const;
  return null;
}

function needsLocation(data: IntakeCollectedData) {
  const operating = (data.operatingCondition ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return data.urgency === "critica" || /imobilizado|parado|nao liga|não liga/.test(operating);
}

function isCancellation(value: string) {
  return /^(cancelar|cancela|parar|sair)$/i.test(value.trim());
}

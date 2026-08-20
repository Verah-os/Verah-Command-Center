"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { persistInboundMessage } from "@/services/whatsapp/repository";
import {
  createSyntheticPilotDemoMessages,
  isSyntheticPilotDemoEnabled,
} from "@/services/whatsapp/synthetic-demo";

export async function startSyntheticWhatsAppDemo() {
  if (!isSyntheticPilotDemoEnabled(process.env)) {
    redirect("/demo/whatsapp?error=unavailable");
  }

  try {
    for (const message of createSyntheticPilotDemoMessages(randomUUID())) {
      await persistInboundMessage(message);
    }
  } catch {
    redirect("/demo/whatsapp?error=failed");
  }

  redirect("/concierge?demo=created");
}

"use server";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/services/supabase/server";
const text=(form:FormData,key:string)=>{const value=form.get(key);return typeof value==="string"&&value.trim()?value.trim():null};
export async function saveQuote(form:FormData){
 const rid=text(form,"requestId")??"",pid=text(form,"providerId")??"";let items:unknown;
 try{items=JSON.parse(text(form,"itemsJson")??"[]");}catch{redirect(`/demo/prestador/atendimento/${rid}?provider=${pid}&error=Itens%20inválidos` as Route)}
 const s=await createSupabaseServerClient();const{data:{user}}=await s.auth.getUser();if(!user)redirect("/login");
 const{data,error}=await s.rpc("save_service_quote_draft",{p_service_request_id:rid,p_provider_id:pid,p_items:items,p_estimated_duration:text(form,"estimatedDuration"),p_technical_notes:text(form,"technicalNotes"),p_customer_summary:text(form,"customerSummary"),p_warranty_text:text(form,"warrantyText"),p_valid_until:text(form,"validUntil")});
 if(error)redirect(`/demo/prestador/atendimento/${rid}?provider=${pid}&error=${encodeURIComponent(error.message)}` as Route);
 if(form.get("intent")==="submit"){const{error:submitError}=await s.rpc("submit_service_quote",{p_quote_id:data});if(submitError)redirect(`/demo/prestador/atendimento/${rid}?provider=${pid}&error=${encodeURIComponent(submitError.message)}` as Route)}
 revalidatePath(`/demo/prestador/atendimento/${rid}`);revalidatePath(`/demo/cliente/atendimento/${rid}`);revalidatePath(`/concierge/${rid}`);redirect(`/demo/prestador/atendimento/${rid}?provider=${pid}&saved=1` as Route);
}
export async function decideQuote(form:FormData){const id=text(form,"quoteId")??"",rid=text(form,"requestId")??"",intent=text(form,"intent"),note=text(form,"note");const s=await createSupabaseServerClient();const fn=intent==="approve"?"approve_service_quote":"request_quote_clarification";const{error}=await s.rpc(fn,{p_quote_id:id,p_customer_decision_note:note});if(error)redirect(`/demo/cliente/atendimento/${rid}?error=${encodeURIComponent(error.message)}` as Route);revalidatePath(`/demo/cliente/atendimento/${rid}`);revalidatePath(`/concierge/${rid}`);revalidatePath("/dashboard");redirect(`/demo/cliente/atendimento/${rid}?decision=${intent}` as Route)}

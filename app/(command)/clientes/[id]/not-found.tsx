import Link from "next/link";
import { crmLink } from "@/components/customer-crm/panels";
export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Cliente não encontrada</h1>
      <p>O registro não existe ou não está acessível com suas permissões.</p>
      <Link href="/clientes" className={crmLink}>
        Voltar para Clientes
      </Link>
    </div>
  );
}

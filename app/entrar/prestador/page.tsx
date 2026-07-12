import { LoginForm } from "@/components/auth/login-form";
export default async function Page({searchParams}:{searchParams:Promise<{error?:string}>}){const{error}=await searchParams;return <main className="flex min-h-screen items-center justify-center p-5"><LoginForm error={error} title="Área do prestador" description="Veja os briefings e atualize seus serviços."/></main>}

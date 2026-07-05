import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <LoginForm error={searchParams.error} />
    </main>
  );
}

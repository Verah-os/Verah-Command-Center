"use client";

export default function HomologationError() {
  return (
    <section role="alert" className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border bg-card p-5">
      <h1 className="text-xl font-semibold">Não foi possível concluir a operação</h1>
      <p>A sessão pode ter mudado em outra aba ou a conexão ter sido interrompida. Não reenvie o formulário antes de conferir os dados salvos.</p>
      <p>Entre novamente como Admin e consulte o mesmo prestador. Para testar outro papel ao mesmo tempo, use um perfil de navegador separado.</p>
      <a className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 py-2 text-primary-foreground" href="/login">Entrar novamente como Admin</a>
    </section>
  );
}

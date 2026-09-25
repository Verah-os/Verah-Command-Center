type AssignmentError = { code?: string; message?: string };

// Only known domain messages may reach the UI. Never expose SQL, details or hints.
const messages = new Map<string, string>([
  ["Provider is not eligible for this service context.", "Este prestador não está habilitado para este serviço. A equipe responsável precisa verificar a homologação e a autorização para a categoria e o contexto do atendimento. Portal ativo não substitui essa habilitação."],
  ["Atendimento não pertence ao Concierge autenticado.", "Este atendimento pertence a outro Concierge. A indicação deve ser feita pelo responsável ou por um administrador autorizado."],
  ["Apenas Concierge ou Admin pode indicar prestador.", "Sua conta não tem permissão para indicar prestadores. Entre com uma conta Concierge ou Admin autorizada."],
  ["Apenas Concierge ou Admin pode alterar o prestador.", "Sua conta não tem permissão para alterar o prestador. Entre com uma conta Concierge ou Admin autorizada."],
  ["Este atendimento já possui um prestador indicado.", "A indicação não está disponível no estado atual do atendimento. Atualize a página e confira a etapa e o prestador vinculado."],
  ["Atendimento não encontrado.", "O atendimento não foi encontrado. Volte à lista e confira o atendimento selecionado."],
  ["Prestador ativo não encontrado.", "O prestador selecionado não está ativo ou não foi encontrado. Atualize a lista de prestadores."],
  ["O novo prestador não está ativo.", "O prestador selecionado não está ativo. Atualize a lista de prestadores."],
  ["O motivo da alteração é obrigatório.", "Informe o motivo da alteração do prestador."],
  ["Selecione um prestador diferente do atual.", "Selecione um prestador diferente do atual."],
  ["A alteração não está disponível nesta etapa.", "A alteração de prestador não está disponível nesta etapa do atendimento."],
  ["A alteração fica indisponível após o envio do orçamento.", "A alteração de prestador fica indisponível após o envio do orçamento."],
]);

export function providerAssignmentErrorMessage(error: AssignmentError): string {
  const known = messages.get(error.message ?? "");
  if (known) return known;
  if (error.code === "42501") {
    return "A indicação foi bloqueada por uma regra de autorização. A equipe responsável precisa verificar as permissões deste atendimento.";
  }
  if (error.code === "PGRST202" || error.code === "42883") {
    return "O serviço de indicação está indisponível nesta versão do ambiente. A equipe técnica precisa verificar a configuração.";
  }
  return "Não foi possível concluir a indicação. A causa não foi identificada; informe à equipe técnica a referência de diagnóstico registrada no servidor.";
}

export function providerAssignmentErrorCode(error: AssignmentError): string {
  // Codes are useful for diagnosis; arbitrary database text is not safe to log.
  return /^[A-Z0-9]{5,8}$/.test(error.code ?? "") ? error.code! : "UNKNOWN";
}

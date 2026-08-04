# ADR 005 — Dispatcher contínuo local do VERAH OS

- Status: aceito para Alpha
- Data: 2026-08-04
- Issue: #89

## Contexto

O VERAH OS Core já seleciona uma Issue autorizada, mantém checkpoint atômico,
lease, lock no GitHub e recuperação após interrupção. Ainda faltava um processo
local que encadeasse ciclos sem depender de um novo comando humano, sem criar
paralelismo ou ampliar os poderes do agente.

## Decisão

Um dispatcher local, desabilitado e em dry-run por padrão, passa a reconciliar
checkpoint, PR aberto, checks e fila antes de cada decisão. Ele mantém um único
mutex de processo e invoca `codex exec` sem shell, com sandbox
`workspace-write`, aprovação `never` e prompt fixo para a Skill
`$verah-os-unattended`. Flags que removem sandbox, regras ou aprovações são
recusadas pela configuração.

O GitHub continua sendo a fila e o lock operacional. O checkpoint existente
continua sendo o estado resumível do ciclo. O dispatcher grava somente budget,
backoff, PID, heartbeat e identificadores não sensíveis em `.verah-os/`, que é
local e ignorado pelo Git. Nenhuma nova persistência de domínio ou migration é
criada.

## Gates e sequência

1. um checkpoint ou PR existente sempre prevalece sobre nova seleção;
2. CI pendente, review pendente ou conflito pausam o processo;
3. falha de CI ou changes requested pode consumir a reserva de duas correções;
4. PR Draft com todos os checks verdes pode ser entregue à Skill para ficar
   Ready;
5. merge continua exigindo `codex:auto-merge` e todos os gates da Skill;
6. somente após o ciclo anterior ser reconciliado como concluído outra Issue
   pode ser selecionada.

Quota, rate limit e autenticação produzem backoff exponencial limitado. Budget
por janela limita ciclos, invocações, duração e tokens reportados pelo CLI;
capacidade mínima fica reservada ao PR corrente. O kill switch e o arquivo
`STOP` sempre prevalecem.

## Windows e watchdog

O processo pode ser iniciado no login do usuário por Task Scheduler, sem
elevação e sem credenciais na tarefa. Um segundo agendamento chama `start` a
cada cinco minutos: processos vivos e saudáveis não são duplicados; PID morto é
recuperado; processo ainda vivo com heartbeat vencido falha fechado para evitar
encerrar um PID reutilizado. A instalação é opcional e reversível.

## Consequências e limites

- há uma única sessão e uma única Issue por host;
- não há suporte a múltiplas máquinas ou agentes paralelos;
- logs contêm apenas categorias sanitizadas e usam a rotação já existente;
- saída bruta do Codex não é persistida pelo dispatcher;
- credenciais de produção são removidas do ambiente filho;
- a automação não garante disponibilidade enquanto o computador estiver
  desligado ou sem rede;
- produção, banco remoto, mensagens, pagamentos, Supabase, Vercel e n8n não
  recebem qualquer novo caminho mutável.

import { sanitizeText } from "./sanitization.ts";
import type { DryRunPlan, ParsedIssue, SyntheticIssueEvent } from "./types.ts";

const aliases = new Map([
  ["objetivo", "objective"],
  ["objective", "objective"],
  ["escopo", "scope"],
  ["scope", "scope"],
  ["criterios de aceite", "acceptanceCriteria"],
  ["acceptance criteria", "acceptanceCriteria"],
  ["restricoes", "constraints"],
  ["constraints", "constraints"],
]);

function normalizedHeading(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
function listFromSection(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => sanitizeText(line, 500))
    .slice(0, 30);
}

export function parseIssueTemplate(event: SyntheticIssueEvent): ParsedIssue {
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of event.issue.body.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = aliases.get(normalizedHeading(heading[1])) ?? null;
      if (current && !sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current) sections.get(current)?.push(line);
  }

  const objective = sanitizeText((sections.get("objective") ?? []).join("\n"), 2_000);
  const scope = listFromSection((sections.get("scope") ?? []).join("\n"));
  const acceptanceCriteria = listFromSection(
    (sections.get("acceptanceCriteria") ?? []).join("\n"),
  );
  const constraints = listFromSection(
    (sections.get("constraints") ?? []).join("\n"),
  );

  if (!objective || !scope.length || !acceptanceCriteria.length || !constraints.length) {
    throw new Error("invalid_issue_template");
  }

  return {
    repository: event.repository,
    number: event.issue.number,
    title: sanitizeText(event.issue.title, 256),
    updatedAt: event.issue.updatedAt,
    objective,
    scope,
    acceptanceCriteria,
    constraints,
  };
}

export function buildDryRunPlan(issue: ParsedIssue): DryRunPlan {
  return {
    objective: issue.objective,
    steps: issue.scope.map((item, index) => `${index + 1}. Planejar: ${item}`),
    acceptanceCriteria: issue.acceptanceCriteria,
    constraints: issue.constraints,
    risks: [
      "Conteúdo da issue é entrada não confiável.",
      "Qualquer ação mutável exige um gate humano futuro.",
    ],
    gates: [
      "Nenhuma branch, commit, PR ou comentário será criado.",
      "Nenhum ambiente de produção será acessado.",
    ],
  };
}

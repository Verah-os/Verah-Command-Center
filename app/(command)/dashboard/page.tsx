import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { env } from "@/lib/env";
import { githubRequest } from "@/services/github/client";

export const dynamic = "force-dynamic";

type GitHubRepo = {
  updated_at: string | null;
};

type GitHubSearchResponse = {
  total_count: number;
};

type GitHubCardState =
  | {
      status: "Not configured";
    }
  | {
      status: "Error";
      message: string;
    }
  | {
      status: "Online";
      repositoryCount: number;
      openPullRequests: number;
      openIssues: number;
      lastUpdatedAt: string | null;
    };

async function fetchRepositorySummary(owner: string) {
  let repositoryCount = 0;
  let lastUpdatedAt: string | null = null;
  let page = 1;

  while (true) {
    const repositories = await githubRequest<GitHubRepo[]>({
      path: `/orgs/${owner}/repos?type=all&sort=updated&direction=desc&per_page=100&page=${page}`
    });

    if (page === 1) {
      lastUpdatedAt = repositories[0]?.updated_at ?? null;
    }

    repositoryCount += repositories.length;

    if (repositories.length < 100) {
      break;
    }

    page += 1;
  }

  return { repositoryCount, lastUpdatedAt };
}

async function fetchOpenCount(owner: string, qualifier: "is:pr" | "is:issue") {
  const query = encodeURIComponent(`org:${owner} ${qualifier} is:open`);
  const response = await githubRequest<GitHubSearchResponse>({
    path: `/search/issues?q=${query}`
  });

  return response.total_count;
}

async function getGitHubCardState(): Promise<GitHubCardState> {
  if (!env.githubToken) {
    return { status: "Not configured" };
  }

  try {
    const [repositories, openPullRequests, openIssues] = await Promise.all([
      fetchRepositorySummary(env.githubOwner),
      fetchOpenCount(env.githubOwner, "is:pr"),
      fetchOpenCount(env.githubOwner, "is:issue")
    ]);

    return {
      status: "Online",
      repositoryCount: repositories.repositoryCount,
      openPullRequests,
      openIssues,
      lastUpdatedAt: repositories.lastUpdatedAt
    };
  } catch {
    return {
      status: "Error",
      message: "Não foi possível carregar dados."
    };
  }
}

function formatLastUpdated(value: string | null) {
  if (!value) {
    return "Sem update";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function DashboardPage() {
  const github = await getGitHubCardState();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">VERAH Command Center</h1>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium text-muted-foreground">System Online</h2>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">Ready</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium text-muted-foreground">GitHub</h2>
          </CardHeader>
          <CardContent>
            {github.status === "Online" ? (
              <div className="space-y-2 text-sm">
                <p className="text-2xl font-semibold">{github.repositoryCount}</p>
                <p className="text-muted-foreground">Total de repositórios acessíveis</p>
                <div className="grid gap-1 pt-2">
                  <p>PRs abertas: {github.openPullRequests}</p>
                  <p>Issues abertas: {github.openIssues}</p>
                  <p>Último update: {formatLastUpdated(github.lastUpdatedAt)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-2xl font-semibold">{github.status}</p>
                {github.status === "Error" ? (
                  <p className="text-muted-foreground">{github.message}</p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium text-muted-foreground">Runtime</h2>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">Ready</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium text-muted-foreground">Atlas</h2>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">Ready</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

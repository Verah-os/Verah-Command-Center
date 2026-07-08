import { env } from "@/lib/env";

type GitHubRequestOptions = {
  path: string;
  init?: RequestInit;
};

export async function githubRequest<T>({ path, init }: GitHubRequestOptions): Promise<T> {
  if (!env.githubToken) {
    throw new Error("GITHUB_TOKEN is required");
  }

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.githubToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    console.error("GitHub API request failed", {
      endpoint: path,
      status: response.status,
      message
    });

    throw new Error(`GitHub API failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

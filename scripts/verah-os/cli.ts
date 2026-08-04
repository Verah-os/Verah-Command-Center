import { readVerahOsConfig } from "./config.ts";
import { githubOperations } from "./github.ts";
import { completeCycle, continueCycle, dryRunCycle, healthCycle, heartbeatCycle, statusCycle } from "./orchestrator.ts";
import { resume, stop } from "./state.ts";

async function main() {
  const command = process.argv[2];
  const config = readVerahOsConfig(process.env);

  if (command === "stop") {
    await stop(config.runtimeDirectory);
    console.log(JSON.stringify({ status: "stopped", productionMutations: [] }, null, 2));
    return;
  }
  if (command === "resume") {
    await resume(config.runtimeDirectory);
    console.log(JSON.stringify({ status: "resumed", productionMutations: [] }, null, 2));
    return;
  }

  const result =
    command === "dry-run"
      ? await dryRunCycle(config, githubOperations)
      : command === "status"
        ? await statusCycle(config, githubOperations)
        : command === "continue"
          ? await continueCycle(config, githubOperations)
          : command === "recover"
            ? await continueCycle(config, githubOperations)
          : command === "health"
            ? await healthCycle(config)
          : command === "heartbeat"
            ? await heartbeatCycle(config)
            : command === "complete"
              ? await completeCycle(config)
          : null;

  if (!result) throw new Error("usage: continue|recover|health|status|dry-run|heartbeat|complete|stop|resume");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown_error";
  console.error(JSON.stringify({ status: "blocked", error: message }));
  process.exitCode = 1;
});

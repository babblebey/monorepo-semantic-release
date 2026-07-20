import semanticReleaseCore from "@semantic-release/core";
import { createExecutionPlugins } from "./adapt-plugins.js";

export default async function runPlan({ preparedRuns, order }) {
  const released = [];
  const skipped = [];

  for (const packageName of order) {
    const prepared = preparedRuns.get(packageName);
    if (!prepared) {
      continue;
    }

    if (!prepared.shouldRelease) {
      skipped.push({
        name: prepared.package.name,
        path: prepared.package.path,
        reason: "no relevant changes",
      });
      prepared.context.logger.skip("Release execution skipped (no relevant changes)");
      continue;
    }
    
    prepared.context.logger.start("Starting release execution...");
    const executionPlugins = createExecutionPlugins(prepared.plugins);
    const result = await semanticReleaseCore({ context: prepared.context, plugins: executionPlugins });

    if (result) {
      released.push({
        name: prepared.package.name,
        path: prepared.package.path,
        result,
      });
      prepared.context.logger.complete("Completed release execution (released)");
    } else {
      prepared.context.logger.complete("Completed release execution (no release published)");
    }
  }

  return { released, skipped };
}

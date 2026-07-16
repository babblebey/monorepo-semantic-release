import path from "node:path";
import semanticReleaseCore, { resolveConfig } from "@semantic-release/core";
import { createPlanningPlugins } from "./adapt-plugins.js";
import topoSortPackages from "./topo-sort.js";

function applyTagFormatTemplate(tagFormat, packageName) {
  if (!tagFormat) {
    return undefined;
  }

  return tagFormat.replace(/\$\{name\}/g, packageName);
}

function createPackageLogger(logger, packageName) {
  // Keep full Signale API (including scope/scopeName) expected by core plugin normalization.
  return typeof logger.scope === "function" ? logger.scope(packageName) : logger;
}

function toSummaryCommits(commits = []) {
  return commits.map(({ hash, message }) => ({ hash, message }));
}

export default async function buildPlan({ sharedContext, packages, options }) {
  const planEntries = [];
  const preparedRuns = new Map();

  for (const pkg of packages) {
    const packageCwd = path.resolve(sharedContext.cwd, pkg.path);
    const packageContext = {
      ...sharedContext,
      cwd: packageCwd,
      logger: createPackageLogger(sharedContext.logger, pkg.name),
    };

    const runtimeOptions = {
      dryRun: options.dryRun,
      ci: options.ci,
      noCi: options.noCi,
      branches: options.branches,
      repositoryUrl: options.repositoryUrl,
      plugins: pkg.plugins || options.plugins,
      tagFormat: pkg.tagFormat || applyTagFormatTemplate(options.tagFormat, pkg.name),
    };

    const { options: resolvedOptions, plugins } = await resolveConfig(packageContext, runtimeOptions, {
      buildPlugins: true,
      baseConfig: pkg.baseConfig || options.baseConfig,
    });

    const contextWithOptions = { ...packageContext, options: resolvedOptions };
    const planningPlugins = createPlanningPlugins(plugins);
    const result = pkg.release === false ? false : await semanticReleaseCore({ context: contextWithOptions, plugins: planningPlugins });

    const planned = {
      name: pkg.name,
      path: pkg.path,
      changed: Boolean(result && result.nextRelease),
      skipped: pkg.release === false ? "package release disabled" : result ? undefined : "no relevant changes",
      commits: toSummaryCommits(result?.commits || []),
      lastRelease: result?.lastRelease,
      nextRelease: result?.nextRelease,
      notes: result?.nextRelease?.notes,
    };

    planEntries.push(planned);

    preparedRuns.set(pkg.name, {
      package: pkg,
      context: contextWithOptions,
      plugins,
      shouldRelease: Boolean(result && result.nextRelease),
    });
  }

  const order = topoSortPackages(packages);

  return {
    plan: {
      packages: planEntries,
      order,
    },
    preparedRuns,
  };
}

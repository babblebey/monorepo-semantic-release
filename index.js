import path from "node:path";

import { getLogger, resolveConfig, resolveEnvCi } from "@semantic-release/core";
import discoverPackages, { resolveWorkspaceRoot } from "./lib/discover-packages.js";
import buildPlan from "./lib/build-plan.js";
import runPlan from "./lib/run-plan.js";

function resolveConfigRoot(cwd, configRoot) {
  if (configRoot) {
    return path.resolve(cwd, configRoot);
  }

  return cwd;
}

function toPackageRuntimeOverrides(cliOptions) {
  return {
    ci: cliOptions.ci,
    noCi: cliOptions.noCi,
    branches: cliOptions.branches,
    plugins: cliOptions.plugins,
    repositoryUrl: cliOptions.repositoryUrl,
    tagFormat: cliOptions.tagFormat,
  };
}

function stripMonorepoOnlyOptions(options) {
  const {
    packages,
    discoverPackages,
    onPlan,
    configRoot,
    ...releaseOptions
  } = options;

  return releaseOptions;
}

export default async function releaseMonorepo(
  cliOptions = {},
  { cwd = process.cwd(), env = process.env, stdout = process.stdout, stderr = process.stderr } = {}
) {
  const workspaceRoot = await resolveWorkspaceRoot(resolveConfigRoot(cwd, cliOptions.configRoot));
  const envCiResult = resolveEnvCi({ env, cwd: workspaceRoot });
  const { isCi, isPr } = envCiResult;
  const noCi = Boolean(cliOptions.noCi || cliOptions.ci === false);

  const shouldAutoDryRun = !isCi && !cliOptions.dryRun && !noCi;
  const effectiveCliOptions = shouldAutoDryRun ? { ...cliOptions, dryRun: true } : cliOptions;
  const shouldSkipRelease = isCi && isPr && !noCi;

  const sharedContext = {
    cwd: workspaceRoot,
    env,
    stdout,
    stderr,
    envCi: envCiResult,
  };

  sharedContext.logger = getLogger(sharedContext);

  const { options: rootResolvedOptions } = await resolveConfig(sharedContext, {}, { buildPlugins: false });
  const resolvedOptions = { ...rootResolvedOptions, ...effectiveCliOptions };

  if (shouldAutoDryRun) {
    sharedContext.logger.warn("This run was not triggered in a known CI environment, running in dry-run mode.");
  }

  if (shouldSkipRelease) {
    sharedContext.logger.log("This run was triggered by a pull request and therefore a new version will not be published.");
    return false;
  }

  const packages = await discoverPackages({
    cwd: workspaceRoot,
    packages: resolvedOptions.packages,
    discoverPackages: resolvedOptions.discoverPackages !== false,
  });

  const { plan, preparedRuns } = await buildPlan({
    sharedContext,
    packages,
    options: {
      dryRun: resolvedOptions.dryRun,
      rootBaseConfig: stripMonorepoOnlyOptions(rootResolvedOptions),
      runtimeOverrides: toPackageRuntimeOverrides(effectiveCliOptions),
    },
  });

  if (typeof resolvedOptions.onPlan === "function") {
    await resolvedOptions.onPlan(plan);
  }

  if (resolvedOptions.dryRun) {
    const executionSkipped = plan.order
      .map((packageName) => plan.packages.find((pkg) => pkg.name === packageName))
      .filter((pkg) => pkg?.changed)
      .map((pkg) => ({
        name: pkg.name,
        path: pkg.path,
        reason: "execution skipped in dry-run mode",
      }));

    return {
      plan,
      released: [],
      skipped: executionSkipped,
    };
  }

  const execution = await runPlan({ preparedRuns, order: plan.order });

  return {
    plan,
    ...execution,
  };
}

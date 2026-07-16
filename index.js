import { getLogger, resolveEnvCi } from "@semantic-release/core";
import discoverPackages from "./lib/discover-packages.js";
import buildPlan from "./lib/build-plan.js";
import runPlan from "./lib/run-plan.js";

export default async function releaseMonorepo(
  cliOptions = {},
  { cwd = process.cwd(), env = process.env, stdout = process.stdout, stderr = process.stderr } = {}
) {
  const envCiResult = resolveEnvCi({ env, cwd });
  const { isCi, isPr } = envCiResult;
  const noCi = Boolean(cliOptions.noCi || cliOptions.ci === false);

  const shouldAutoDryRun = !isCi && !cliOptions.dryRun && !noCi;
  const effectiveOptions = shouldAutoDryRun ? { ...cliOptions, dryRun: true } : cliOptions;
  const shouldSkipRelease = isCi && isPr && !noCi;

  const sharedContext = {
    cwd,
    env,
    stdout,
    stderr,
    envCi: envCiResult,
  };

  sharedContext.logger = getLogger(sharedContext);

  if (shouldAutoDryRun) {
    sharedContext.logger.warn("This run was not triggered in a known CI environment, running in dry-run mode.");
  }

  if (shouldSkipRelease) {
    sharedContext.logger.log("This run was triggered by a pull request and therefore a new version will not be published.");
    return false;
  }

  const packages = await discoverPackages({
    cwd,
    packages: effectiveOptions.packages,
    discoverPackages: effectiveOptions.discoverPackages !== false,
  });

  const { plan, preparedRuns } = await buildPlan({
    sharedContext,
    packages,
    options: {
      dryRun: effectiveOptions.dryRun,
      ci: effectiveOptions.ci,
      noCi: effectiveOptions.noCi,
      branches: effectiveOptions.branches,
      plugins: effectiveOptions.plugins,
      repositoryUrl: effectiveOptions.repositoryUrl,
      tagFormat: effectiveOptions.tagFormat || "${name}@${version}",
      baseConfig: effectiveOptions.baseConfig,
    },
  });

  if (typeof effectiveOptions.onPlan === "function") {
    await effectiveOptions.onPlan(plan);
  }

  if (effectiveOptions.dryRun) {
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

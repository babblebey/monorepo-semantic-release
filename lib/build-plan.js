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

function normalizeScopeName(scopeName, fallback) {
  if (Array.isArray(scopeName)) {
    return scopeName.flat().map((scope) => String(scope)).join(":");
  }

  if (typeof scopeName === "string" && scopeName.trim().length > 0) {
    return scopeName;
  }

  return fallback;
}

function createCompatibleLogger(baseLogger, fallbackScopeName = "semantic-release") {
  const compatibleLogger = {
    scopeName: normalizeScopeName(baseLogger.scopeName, fallbackScopeName),
    log: (...args) => baseLogger.log(...args),
    warn: (...args) => baseLogger.warn(...args),
    error: (...args) => baseLogger.error(...args),
    success: (...args) => baseLogger.success(...args),
    scope: (...scopes) => {
      const normalizedScopes = scopes
        .flat()
        .filter((scope) => scope !== undefined && scope !== null)
        .map((scope) => String(scope));

      if (typeof baseLogger.scope !== "function") {
        return createCompatibleLogger(baseLogger, compatibleLogger.scopeName);
      }

      const scoped = baseLogger.scope(...normalizedScopes);
      const nextScopeName = normalizedScopes.length > 0 ? normalizedScopes.join(":") : compatibleLogger.scopeName;
      return createCompatibleLogger(scoped, nextScopeName);
    },
  };

  return compatibleLogger;
}

function createPackageLogger(logger, packageName) {
  // Keep full Signale API (including scope/scopeName) expected by core plugin normalization.
  if (typeof logger.scope !== "function") {
    return createCompatibleLogger(logger, packageName);
  }

  const scopedLogger = logger.scope(packageName);
  return createCompatibleLogger(scopedLogger, packageName);
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
      // Planning must always be side-effect free (no tags, pushes, or publishes).
      dryRun: true,
      ci: options.ci,
      noCi: options.noCi,
      branches: options.branches,
      repositoryUrl: options.repositoryUrl,
      plugins: pkg.plugins || options.plugins,
      tagFormat: pkg.tagFormat || applyTagFormatTemplate(options.tagFormat, pkg.name),
    };

    packageContext.logger.log("Starting release plan...");

    const { options: resolvedOptions, plugins } = await resolveConfig(packageContext, runtimeOptions, {
      buildPlugins: true,
      baseConfig: pkg.baseConfig || options.baseConfig,
    });

    const contextWithOptions = { ...packageContext, options: resolvedOptions };
    const executionContext = {
      ...packageContext,
      options: {
        ...resolvedOptions,
        dryRun: options.dryRun,
      },
    };

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

    if (planned.skipped) {
      packageContext.logger.log(`Completed release plan (skipped: ${planned.skipped}).`);
    } else if (planned.changed) {
      packageContext.logger.log("Completed release plan (release required).");
    } else {
      packageContext.logger.log("Completed release plan (no release required).");
    }

    preparedRuns.set(pkg.name, {
      package: pkg,
      context: executionContext,
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

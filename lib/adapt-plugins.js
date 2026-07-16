import { getTouchedCommitHashes } from "./git-changes.js";

const scopedCommitCache = new WeakMap();

async function getScopedContext(context) {
  const cacheValue = scopedCommitCache.get(context);
  if (cacheValue) {
    return cacheValue;
  }

  if (!Array.isArray(context.commits) || context.commits.length === 0) {
    scopedCommitCache.set(context, context);
    return context;
  }

  const touchedCommitHashes = await getTouchedCommitHashes({
    cwd: context.cwd,
    env: context.env,
    from: context.lastRelease?.gitHead,
    to: context.nextRelease?.gitHead || "HEAD",
    path: ".",
  });

  const scopedCommits = context.commits.filter((commit) => touchedCommitHashes.has(commit.hash));
  const scopedContext = {
    ...context,
    commits: scopedCommits,
    lastRelease: context.lastRelease || {},
    nextRelease: context.nextRelease || {},
  };
  scopedCommitCache.set(context, scopedContext);

  return scopedContext;
}

function createScopedPlugins(plugins, { planning = false } = {}) {
  const scopedPlugins = { ...plugins };

  if (plugins.analyzeCommits) {
    scopedPlugins.analyzeCommits = async (context) => {
      const scopedContext = await getScopedContext(context);
      if (!scopedContext.commits.length) {
        return null;
      }

      return plugins.analyzeCommits(scopedContext);
    };
  }

  if (plugins.generateNotes) {
    scopedPlugins.generateNotes = async (context) => {
      const scopedContext = await getScopedContext(context);
      return plugins.generateNotes(scopedContext);
    };
  }

  if (planning) {
    scopedPlugins.prepare = async () => {};
    scopedPlugins.publish = async () => [];
    scopedPlugins.addChannel = async () => [];
    scopedPlugins.success = async () => {};
    scopedPlugins.fail = async () => {};
  }

  return scopedPlugins;
}

export function createPlanningPlugins(plugins) {
  return createScopedPlugins(plugins, { planning: true });
}

export function createExecutionPlugins(plugins) {
  return createScopedPlugins(plugins);
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import YAML from "yaml";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function hasWorkspaceConfig(cwd) {
  const rootPackageJsonPath = path.join(cwd, "package.json");
  const pnpmWorkspacePath = path.join(cwd, "pnpm-workspace.yaml");

  try {
    const rootPackageJson = await readOptionalJson(rootPackageJsonPath);
    return parseWorkspacePatterns(rootPackageJson).length > 0;
  } catch {
    // fall through and check pnpm workspace file below
  }

  try {
    await readFile(pnpmWorkspacePath, "utf8");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function resolveWorkspaceRoot(startCwd) {
  let currentCwd = startCwd;

  while (true) {
    if (await hasWorkspaceConfig(currentCwd)) {
      return currentCwd;
    }

    const parentCwd = path.dirname(currentCwd);
    if (parentCwd === currentCwd) {
      return startCwd;
    }

    currentCwd = parentCwd;
  }
}

async function readPnpmWorkspacePatterns(cwd) {
  const pnpmWorkspacePath = path.join(cwd, "pnpm-workspace.yaml");

  try {
    const raw = await readFile(pnpmWorkspacePath, "utf8");
    const parsed = YAML.parse(raw);
    return Array.isArray(parsed?.packages) ? parsed.packages : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw new Error(`Failed to parse pnpm-workspace.yaml: ${error.message}`);
  }
}

function normalizePath(inputPath) {
  return inputPath.replace(/\\/g, "/");
}

function parseWorkspacePatterns(rootPackageJson) {
  if (Array.isArray(rootPackageJson.workspaces)) {
    return rootPackageJson.workspaces;
  }

  if (rootPackageJson.workspaces && Array.isArray(rootPackageJson.workspaces.packages)) {
    return rootPackageJson.workspaces.packages;
  }

  return [];
}

function splitWorkspacePatterns(patterns) {
  const includes = [];
  const excludes = [];

  for (const pattern of patterns) {
    const normalized = normalizePath(String(pattern).trim());
    if (!normalized) {
      continue;
    }

    if (normalized.startsWith("!")) {
      const excludePattern = normalized.slice(1).trim();
      if (excludePattern) {
        excludes.push(excludePattern);
      }
    } else {
      includes.push(normalized);
    }
  }

  return { includes, excludes };
}

function normalizeExplicitPackages(packages) {
  return packages.map((pkg) => {
    if (!pkg?.name || !pkg?.path) {
      throw new TypeError("Each explicit package entry must include name and path");
    }

    return {
      ...pkg,
      path: normalizePath(pkg.path),
      dependsOn: pkg.dependsOn || [],
      release: pkg.release !== false,
    };
  });
}

export default async function discoverPackages({ cwd, packages, discoverPackages = true }) {
  if (Array.isArray(packages) && packages.length > 0) {
    return normalizeExplicitPackages(packages);
  }

  if (!discoverPackages) {
    throw new Error("No packages were provided and package discovery is disabled");
  }

  const rootPackageJsonPath = path.join(cwd, "package.json");
  const rootPackageJson = await readOptionalJson(rootPackageJsonPath);
  const packageJsonWorkspacePatterns = parseWorkspacePatterns(rootPackageJson);
  const pnpmWorkspacePatterns = await readPnpmWorkspacePatterns(cwd);
  const workspacePatterns = [...new Set([...packageJsonWorkspacePatterns, ...pnpmWorkspacePatterns])];

  if (workspacePatterns.length === 0) {
    throw new Error("No workspaces configuration found in package.json or pnpm-workspace.yaml");
  }

  const { includes, excludes } = splitWorkspacePatterns(workspacePatterns);

  if (includes.length === 0) {
    throw new Error("No workspace include patterns were found in package.json or pnpm-workspace.yaml");
  }

  const packageJsonFiles = await fg(
    includes.map((pattern) => `${pattern}/package.json`),
    {
      cwd,
      onlyFiles: true,
      ignore: ["**/node_modules/**", ...excludes.map((pattern) => `${pattern}/**`)],
    }
  );

  const discoveredPackages = await Promise.all(
    packageJsonFiles.map(async (relativePackageJsonPath) => {
      const absolutePackageJsonPath = path.join(cwd, relativePackageJsonPath);
      const packageJson = await readJson(absolutePackageJsonPath);
      const packagePath = normalizePath(path.dirname(relativePackageJsonPath));

      if (!packageJson.name) {
        throw new Error(`Workspace package at ${relativePackageJsonPath} is missing a name`);
      }

      return {
        name: packageJson.name,
        path: packagePath,
        private: Boolean(packageJson.private),
        release: packageJson.private ? false : true,
        rawPackageJson: packageJson,
      };
    })
  );

  const packageNames = new Set(discoveredPackages.map((pkg) => pkg.name));

  return discoveredPackages.map((pkg) => {
    const dependencyFields = [
      pkg.rawPackageJson.dependencies,
      pkg.rawPackageJson.devDependencies,
      pkg.rawPackageJson.peerDependencies,
      pkg.rawPackageJson.optionalDependencies,
    ].filter(Boolean);

    const dependsOn = new Set();
    for (const deps of dependencyFields) {
      for (const depName of Object.keys(deps)) {
        if (packageNames.has(depName)) {
          dependsOn.add(depName);
        }
      }
    }

    return {
      name: pkg.name,
      path: pkg.path,
      private: pkg.private,
      release: pkg.release,
      dependsOn: [...dependsOn],
    };
  });
}

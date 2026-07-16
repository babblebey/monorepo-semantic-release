import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
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
  const rootPackageJson = await readJson(rootPackageJsonPath);
  const workspacePatterns = parseWorkspacePatterns(rootPackageJson);

  if (workspacePatterns.length === 0) {
    throw new Error("No workspaces configuration found in package.json");
  }

  const packageJsonFiles = await fg(
    workspacePatterns.map((pattern) => `${pattern.replace(/\\/g, "/")}/package.json`),
    {
      cwd,
      onlyFiles: true,
      ignore: ["**/node_modules/**"],
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

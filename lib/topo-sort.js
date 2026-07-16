export default function topoSortPackages(packages) {
  const packagesByName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const visiting = new Set();
  const visited = new Set();
  const sorted = [];

  function visit(packageName) {
    if (visited.has(packageName)) {
      return;
    }

    if (visiting.has(packageName)) {
      throw new Error(`Dependency cycle detected while sorting packages: ${packageName}`);
    }

    const pkg = packagesByName.get(packageName);
    if (!pkg) {
      return;
    }

    visiting.add(packageName);
    for (const dependencyName of pkg.dependsOn || []) {
      visit(dependencyName);
    }
    visiting.delete(packageName);

    visited.add(packageName);
    sorted.push(packageName);
  }

  for (const pkg of packages) {
    visit(pkg.name);
  }

  return sorted;
}

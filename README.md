# @babblebey/monorepo-semantic-release

Monorepo release orchestration built on [@semantic-release/core](https://github.com/semantic-release/semantic-release/tree/master/core).

Status: beta.

This package runs release planning and execution across workspace packages while preserving package dependency order.

## Usage (Recommended)

Run the tool directly instead of installing it as a dependency.

```bash
npx @babblebey/monorepo-semantic-release --dry-run
```

Using direct execution keeps release tooling decoupled from workspace dependency management and is generally the preferred approach.

## Installation (Less Recommended)

If your workflow requires pinning this package in your repository, you can install it as a dev dependency:

```bash
npm install --save-dev @babblebey/monorepo-semantic-release
```

## Configuration

Configure this wrapper from workspace/root semantic-release config.

### Root config with automatic discovery (recommended)

Use this when your workspace is already defined via workspaces settings.

Wrapper root-only options (introduced by this wrapper, not core semantic-release):

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `packages` | array | auto-discovery | Explicit package definitions for planning and release execution |
| `discoverPackages` | boolean | `true` | Enable or disable workspace package auto-discovery |
| `configRoot` | string | current working directory | Workspace parent folder used when resolving root config/workspace |
| `onPlan` | function | none | Callback invoked with the computed release plan before execution |

Set these only in workspace/root config. Do not set them in package-level config files.

```js
// release.config.mjs (workspace/root)
export default {
	branches: ["main"],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		"@semantic-release/npm",
		"@semantic-release/github",
	],
	tagFormat: "${name}@${version}",
	discoverPackages: true,
};
```

### Root config with explicit package list

Use this when you want full control over package order and per-package overrides.

```js
// release.config.mjs (workspace/root)
export default {
	branches: ["main"],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		"@semantic-release/npm",
		"@semantic-release/github",
	],
	packages: [
		{
			name: "@acme/a",
			path: "packages/a",
			dependsOn: [],
		},
		{
			name: "@acme/b",
			path: "packages/b",
			dependsOn: ["@acme/a"],
			release: true,
			tagFormat: "${name}-v${version}",
			plugins: ["@semantic-release/commit-analyzer"],
			baseConfig: "@acme/semantic-release-config",
		},
	],
};
```

### Package-level semantic-release config

Package-level semantic-release config can still be used for package-specific behavior.

```js
// packages/a/release.config.mjs
export default {
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
	],
};
```

Do not set wrapper-level root options in package-level config files.

### Configuration precedence and override behavior

Release configuration is resolved in layers.

1. Workspace/root semantic-release config is resolved first.
2. Wrapper root-only options (`packages`, `discoverPackages`, `configRoot`, `onPlan`) are applied from workspace/root config.
3. CLI runtime options (for example `--branches`, `--plugins`, `--repository-url`, `--tag-format`, `--ci`, `--no-ci`) override root config for the current run.
4. Per-package overrides from explicit `packages[]` entries are applied for that package.

Per-package override rules:

| Setting | Behavior |
| --- | --- |
| `packages[].plugins` | Overrides root/CLI plugin list for that package |
| `packages[].tagFormat` | Overrides root/CLI tag format for that package |
| `packages[].baseConfig` | Extends base config for that package; object base configs are shallow-merged with root base config, with package values taking precedence |
| `packages[].release` | When `false`, that package is skipped |

Planning and execution notes:

- Planning is always dry-run and side-effect free.
- Execution uses the resolved run options (including dry-run when enabled).

### Best practice for file-path-sensitive plugin options

Some `semantic-release` plugins resolve file paths or globs relative to the active working directory.
This wrapper executes each package release with `cwd` set to that package path, so path-sensitive plugin options should be configured per package when behavior must differ across packages.

Common path-sensitive options include:

- `@semantic-release/github` - `assets`
- `@semantic-release/npm` - `pkgRoot`
- `@semantic-release/changelog` - `changelogFile`
- `@semantic-release/git` - `assets`

Recommendations:

- Keep root plugin config focused on shared behavior.
- Avoid broad root-level file globs for package-specific files.
- Define package-specific file paths in package-level semantic-release config, or in `packages[]` per-package plugin overrides.
- Treat GitHub auto-generated source archives (`zip` and `tar.gz`) as repository-level assets. They are not controlled by `@semantic-release/github` `assets`.

Example package-local config (inside `packages/a/release.config.mjs`):

```js
export default {
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release/changelog",
			{
				changelogFile: "CHANGELOG.md",
			},
		],
		[
			"@semantic-release/npm",
			{
				pkgRoot: ".",
			},
		],
		[
			"@semantic-release/git",
			{
				assets: ["CHANGELOG.md", "package.json"],
				message: "chore(release): ${nextRelease.gitTag} [skip ci]",
			},
		],
		[
			"@semantic-release/github",
			{
				assets: ["dist/**"],
			},
		],
	],
};
```

Example explicit `packages[]` per-package plugin override:

```js
export default {
	branches: ["main"],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		"@semantic-release/npm",
		"@semantic-release/github",
	],
	packages: [
		{
			name: "@acme/a",
			path: "packages/a",
			plugins: [
				"@semantic-release/commit-analyzer",
				"@semantic-release/release-notes-generator",
				["@semantic-release/npm", { pkgRoot: "." }],
				["@semantic-release/github", { assets: ["dist/**"] }],
			],
		},
	],
};
```

## Quickstart

1. Configure semantic-release at your workspace root (see [Configuration](#configuration)).
2. Ensure your workspace is discoverable from the current directory via:
	 - `package.json` workspaces, or
	 - `pnpm-workspace.yaml`
3. Run a dry-run locally:

```bash
npx @babblebey/monorepo-semantic-release --dry-run
```

4. Run on CI on your release branch(es):

```bash
npx @babblebey/monorepo-semantic-release
```

## CLI Usage

```bash
monorepo-semantic-release [options]
```

### Options

| Option | Alias | Type | Description |
| --- | --- | --- | --- |
| `--help` | `-h` | boolean | Show help |
| `--version` | `-v` | boolean | Show package version |
| `--dry-run` | `-d` | boolean | Skip publishing |
| `--ci` | | boolean | Toggle CI verifications |
| `--no-ci` | | boolean | Disable CI verifications |
| `--debug` | | boolean | Enable debug logging (`semantic-release:*`) |
| `--config-root` | | string | Workspace parent folder used to load semantic-release config |
| `--discover-packages` | | boolean | Enable workspace package discovery (default: `true`) |
| `--no-discover-packages` | | boolean | Disable workspace package discovery |
| `--branches` | `-b` | string[] | Release branches (repeatable or comma-separated) |
| `--plugins` | `-p` | string[] | Plugins (repeatable or comma-separated) |
| `--repository-url` | `-r` | string | Git repository URL |
| `--tag-format` | `-t` | string | Tag format (default: `${name}@${version}`) |

Notes:

- List options support repeated flags and comma-separated values. Example: `-b main -b next` and `-b main,next`.
- `--no-discover-packages` sets `discoverPackages` to `false`.

## Runtime Behavior

- If running outside a known CI environment, the command automatically switches to dry-run mode unless you explicitly set `--dry-run` or disable CI checks with `--no-ci`.
- If running on CI for a pull request, publishing is skipped unless CI checks are disabled with `--no-ci`.
- Planning is always side-effect free. It computes what would release before execution.
- Execution runs in topological package order so dependencies are released before dependents.

## Package Discovery

Package discovery works in two modes.

### 1. Automatic discovery (default)

The command reads workspace patterns from:

- `package.json` `workspaces`
- `pnpm-workspace.yaml` `packages`

Package manager reference:

| Package manager | Typical workspace source used by this tool |
| --- | --- |
| npm workspaces | `package.json` `workspaces` |
| Yarn workspaces | `package.json` `workspaces` |
| Bun workspaces | `package.json` `workspaces` |
| pnpm workspaces | `pnpm-workspace.yaml` `packages` (and `package.json` `workspaces` when present) |

It then scans matching workspace `package.json` files and derives internal dependencies to build release order.

Private packages (`"private": true`) are discovered but skipped for release by default.

### 2. Explicit package list

You can provide an explicit package list through workspace/root config instead of auto-discovery.

Important: wrapper-level options should only be set in workspace/root semantic-release configuration.

- Root-only options: `packages`, `discoverPackages`, `configRoot`, `onPlan`
- Do not set these options in package-level semantic-release config files.

See [Root config with explicit package list](#root-config-with-explicit-package-list) for a full example.

Supported explicit package fields:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Package name |
| `path` | string | yes | Path relative to workspace root |
| `dependsOn` | string[] | no | Internal package dependencies used for ordering |
| `release` | boolean | no | Set `false` to skip release for this package |
| `tagFormat` | string | no | Per-package tag format override |
| `plugins` | array | no | Per-package plugin override |
| `baseConfig` | string/object | no | Per-package base config |

## Tag Format

Default tag format is `${name}@${version}`.

When `tagFormat` includes `${name}`, it is resolved per package during planning/execution.

## Programmatic API

The default export runs monorepo release orchestration programmatically.

```js
import releaseMonorepo from "@babblebey/monorepo-semantic-release";

const result = await releaseMonorepo({
	dryRun: true,
	branches: ["main"],
});
```

The result shape is:

| Field | Description |
| --- | --- |
| `plan` | Release plan with `packages` and topological `order` |
| `released` | Successfully released packages (empty in dry-run) |
| `skipped` | Packages skipped during execution with reason |

In dry-run mode, execution is skipped and `released` is always an empty array.

## Troubleshooting

- No workspace config found: ensure `package.json` workspaces or `pnpm-workspace.yaml` exists at or above your current working directory (or set `--config-root`).
- No packages found with discovery disabled: provide an explicit `packages` list in config.
- No releases happen: verify branch config, commit messages, and plugin setup in your semantic-release configuration.

## Related

- [semantic-release](https://github.com/semantic-release/semantic-release)
- [@semantic-release/core](https://github.com/semantic-release/core)
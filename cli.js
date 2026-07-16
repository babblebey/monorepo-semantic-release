import util from "node:util";
import { parseArgs } from "node:util";

import pkg from "./package.json" with { type: "json" };

function toList(values) {
  if (!values) {
    return undefined;
  }

  const list = (Array.isArray(values) ? values : [values]).flatMap((value) =>
    String(value)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  return list.length > 0 ? list : undefined;
}

function printHelp() {
  process.stdout.write(`Monorepo semantic-release\n\nUsage:\n  monorepo-semantic-release [options]\n\nOptions:\n  -h, --help                 Show help\n  -v, --version              Show version\n  -d, --dry-run              Skip publishing\n      --ci                   Toggle CI verifications\n      --no-ci                Disable CI verifications\n      --debug                Enable debug logging (semantic-release:*)\n      --discover-packages    Enable workspace package discovery (default: true)\n      --no-discover-packages Disable workspace package discovery\n  -b, --branches             Release branches (repeatable or comma-separated)\n  -p, --plugins              Plugins (repeatable or comma-separated)\n  -r, --repository-url       Git repository URL\n  -t, --tag-format           Tag format (default: \"\${name}@\${version}\")\n`);
}

function normalizeOptions(values) {
  const options = {
    dryRun: values["dry-run"],
    ci: values.ci,
    noCi: values["no-ci"],
    debug: values.debug,
    repositoryUrl: values["repository-url"],
    tagFormat: values["tag-format"],
  };

  const branches = toList(values.branches);
  if (branches) {
    options.branches = branches;
  }

  const plugins = toList(values.plugins);
  if (plugins) {
    options.plugins = plugins;
  }

  if (typeof values["discover-packages"] === "boolean") {
    options.discoverPackages = values["discover-packages"];
  }

  return options;
}

export default async function cli(argv = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: false,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
        debug: { type: "boolean" },
        ci: { type: "boolean" },
        "no-ci": { type: "boolean" },
        "dry-run": { type: "boolean", short: "d" },
        "discover-packages": { type: "boolean" },
        "no-discover-packages": { type: "boolean" },
        branches: { type: "string", short: "b", multiple: true },
        plugins: { type: "string", short: "p", multiple: true },
        "repository-url": { type: "string", short: "r" },
        "tag-format": { type: "string", short: "t" },
      },
    });

    if (values.help) {
      printHelp();
      return 0;
    }

    if (values.version) {
      process.stdout.write(`${pkg.version}\n`);
      return 0;
    }

    if (values["no-discover-packages"]) {
      values["discover-packages"] = false;
    }

    if (values.debug) {
      (await import("debug")).default.enable("semantic-release:*");
    }

    const options = normalizeOptions(values);
    await (await import("./index.js")).default(options);

    return 0;
  } catch (error) {
    process.stderr.write(util.inspect(error, { colors: true }));
    process.stderr.write("\n");
    return 1;
  }
}

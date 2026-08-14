import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineCli } from "zod-commands";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const cli = defineCli({
  positionals: {
    schema: z
      .array(z.string().regex(/^\d+\.\d+\.\d+$/, "must look like X.Y.Z"))
      .min(1, { error: "You must provide a version number!" })
      .max(1, { error: "Received too many arguments! Expected exactly one." }),
    label: "<version>",
  },
});

const {
  positionals: [version],
} = cli.parseOrExit(process.argv);

const workspaceRootSchema = z.object({ workspaces: z.array(z.string()) });
const packageJsonSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

function resolveWorkspacePackagePaths(patterns: string[]): string[] {
  const packagePaths: string[] = [];
  for (const pattern of patterns) {
    if (!pattern.endsWith("/*")) {
      throw new Error(
        `Unsupported "workspaces" pattern "${pattern}"; only "<dir>/*" is supported.`,
      );
    }
    const dir = path.join(REPO_ROOT, pattern.slice(0, -"/*".length));
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageJsonPath = path.join(dir, entry.name, "package.json");
      if (existsSync(packageJsonPath)) packagePaths.push(packageJsonPath);
    }
  }
  return packagePaths;
}

const { workspaces } = workspaceRootSchema.parse(
  JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")),
);

const packages = resolveWorkspacePackagePaths(workspaces).map(
  (packageJsonPath) => {
    const contents = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const { name } = packageJsonSchema.parse(contents);
    return { packageJsonPath, contents, name };
  },
);

const workspacePackageNames = new Set(packages.map((pkg) => pkg.name));
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
] as const;

for (const { packageJsonPath, contents, name } of packages) {
  contents.version = version;
  for (const field of DEPENDENCY_FIELDS) {
    const deps = contents[field];
    if (!deps) continue;
    for (const depName of Object.keys(deps)) {
      if (workspacePackageNames.has(depName)) {
        deps[depName] = `^${version}`;
      }
    }
  }
  writeFileSync(packageJsonPath, JSON.stringify(contents, null, 2) + "\n");
  console.log(
    `${name}: ${version} (${path.relative(REPO_ROOT, packageJsonPath)})`,
  );
}

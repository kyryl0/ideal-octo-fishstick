import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const installSpec = process.env.LICENSED_SPOTIFY_INSTALL_SPEC;

if (installSpec) {
  console.log(`Installing licensed Spotify provider override: ${installSpec}`);
  runNpm(["install", "--no-save", installSpec], {
    LICENSED_SPOTIFY_INSTALL_SPEC: "",
    LICENSED_SPOTIFY_MODULE: process.env.LICENSED_SPOTIFY_MODULE || ""
  });
}

ensureNodeSpdlBuilt();

function ensureNodeSpdlBuilt() {
  const spdlDir = join(process.cwd(), "node_modules", "spdl");
  const distEntry = join(spdlDir, "dist", "esm", "index.js");
  const sourceEntry = join(spdlDir, "src", "index.ts");

  if (!existsSync(join(spdlDir, "package.json"))) {
    console.log("node-spdl is not installed; skipping node-spdl build.");
    return;
  }

  if (existsSync(distEntry)) {
    console.log("node-spdl dist is already present.");
    return;
  }

  if (!existsSync(sourceEntry)) {
    console.error("node-spdl was installed without dist or src files. Use the GitHub source tarball dependency in package.json.");
    process.exit(1);
  }

  console.log("Building node-spdl from GitHub source.");
  runNpm(["install", "--include=dev"], {}, spdlDir);
  runNpm(["run", "build"], {}, spdlDir);
}

function runNpm(args, env = {}, cwd = process.cwd()) {
  const result = spawnSync(npmCommand, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ...env
    }
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

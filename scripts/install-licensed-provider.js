import { spawnSync } from "node:child_process";

const installSpec = process.env.LICENSED_SPOTIFY_INSTALL_SPEC || process.env.LICENSED_SPOTIFY_MODULE;

if (!installSpec) {
  console.log("No LICENSED_SPOTIFY_INSTALL_SPEC set; skipping licensed provider install.");
  process.exit(0);
}

console.log(`Installing licensed Spotify provider: ${installSpec}`);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["install", "--no-save", installSpec], {
  stdio: "inherit",
  env: {
    ...process.env,
    LICENSED_SPOTIFY_INSTALL_SPEC: "",
    LICENSED_SPOTIFY_MODULE: process.env.LICENSED_SPOTIFY_MODULE || ""
  }
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

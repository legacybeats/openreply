// Docker Swarm mounts decrypted secrets in memory. Keep values out of image
// layers, service specs, shell arguments, logs, and local/Dropbox files.
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

let config;
try {
  config = JSON.parse(readFileSync("/run/secrets/openreply_app", "utf8"));
  if (!config || Array.isArray(config) || typeof config !== "object" ||
      Object.entries(config).some(([key, value]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof value !== "string")) {
    throw new Error();
  }
} catch {
  console.error("OpenReply secret configuration is missing or invalid");
  process.exit(1);
}
const [command, ...args] = process.argv.slice(2);
if (!command) process.exit(1);
const child = spawn(command, args, { stdio: "inherit", env: { ...process.env, ...config } });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("OpenReply process could not start"); process.exit(1); });
child.on("exit", code => process.exit(code ?? 1));

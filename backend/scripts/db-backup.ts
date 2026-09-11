import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { backupCommand, projectRoot } from "./db-tools";

const requested = process.argv[2];
const output = resolve(
  requested ||
    join(
      projectRoot,
      "backups",
      `kindernewgenz-${new Date().toISOString().replaceAll(/[-:.TZ]/g, "")}.dump`,
    ),
);

if (await Bun.file(output).exists())
  throw new Error(`Backup already exists: ${output}`);

await mkdir(resolve(output, ".."), { recursive: true });
const command = backupCommand();
const child = Bun.spawn(command.cmd, {
  cwd: command.cwd,
  stdout: "pipe",
  stderr: "inherit",
});
const dump = await new Response(child.stdout).arrayBuffer();
const exitCode = await child.exited;
if (exitCode !== 0)
  throw new Error(`pg_dump failed with exit code ${exitCode}`);
if (dump.byteLength === 0) throw new Error("pg_dump returned an empty backup");
await Bun.write(output, dump);
console.log(`Backup created: ${output}`);

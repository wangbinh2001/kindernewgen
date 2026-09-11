import { assertBackupFile, restoreCommand } from "./db-tools";

const requested = process.argv[2];
if (!requested || !process.argv.includes("--confirm"))
  throw new Error(
    "Usage: db-restore <backup.dump> --confirm [--database <name>]",
  );

const input = assertBackupFile(requested);
const file = Bun.file(input);
if (!(await file.exists())) throw new Error(`Backup file not found: ${input}`);
const databaseFlag = process.argv.indexOf("--database");
const targetDatabase =
  databaseFlag >= 0 ? process.argv[databaseFlag + 1] : undefined;
if (targetDatabase && !/^[a-zA-Z0-9_]+$/.test(targetDatabase))
  throw new Error("Target database name is invalid");
const command = restoreCommand(targetDatabase || undefined);
const child = Bun.spawn(command.cmd, {
  cwd: command.cwd,
  stdin: "pipe",
  stdout: "inherit",
  stderr: "inherit",
});
await child.stdin.write(await file.arrayBuffer());
child.stdin.end();
const exitCode = await child.exited;
if (exitCode !== 0)
  throw new Error(`pg_restore failed with exit code ${exitCode}`);
console.log("Database restore completed");

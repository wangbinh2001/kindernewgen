import { basename, resolve } from "node:path";

export const projectRoot = resolve(import.meta.dir, "../..");

export function databaseUrl() {
  const value =
    process.env.MIGRATION_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!value)
    throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required");
  return value;
}

export function databaseName(url = databaseUrl()) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name || !/^[a-zA-Z0-9_]+$/.test(name))
    throw new Error(
      "Database name must contain only letters, numbers, and underscores",
    );
  return name;
}

export function backupCommand() {
  const local = Bun.which("pg_dump");
  if (local)
    return {
      cmd: [local, "--format=custom", "--file=-", databaseUrl()],
      cwd: projectRoot,
    };
  return {
    cmd: [
      "docker",
      "compose",
      "exec",
      "-T",
      "db",
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      databaseName(),
      "--format=custom",
    ],
    cwd: projectRoot,
  };
}

export function restoreCommand(targetDatabase = databaseName()) {
  const local = Bun.which("pg_restore");
  if (local) {
    const target = new URL(databaseUrl());
    target.pathname = `/${targetDatabase}`;
    return {
      cmd: [
        local,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--dbname",
        target.toString(),
      ],
      cwd: projectRoot,
    };
  }
  return {
    cmd: [
      "docker",
      "compose",
      "exec",
      "-T",
      "db",
      "pg_restore",
      "-U",
      "postgres",
      "-d",
      targetDatabase,
      "--clean",
      "--if-exists",
      "--no-owner",
    ],
    cwd: projectRoot,
  };
}

export function assertBackupFile(path: string) {
  const value = resolve(path);
  if (!basename(value).endsWith(".dump"))
    throw new Error("Backup file must use the .dump extension");
  return value;
}

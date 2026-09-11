import { expect, test } from "bun:test";
import { createAccessToken, verifyAccessToken } from "../../src/auth/jwt";

async function runJwtImport(envOverrides: Record<string, string | undefined>) {
  const env = Object.fromEntries(
    Object.entries(process.env)
      .filter(([key]) => key !== "ACCESS_TOKEN_SECRET")
      .map(([key, value]) => [key, value ?? ""]),
  );
  Object.assign(env, envOverrides);
  const child = Bun.spawn(
    ["bun", "--no-env-file", "-e", "import('./src/auth/jwt.ts')"],
    {
      cwd: import.meta.dir.replace(/\\tests\\api$/, ""),
      env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: `${stdout}\n${stderr}` };
}

test("access token preserves tenant claims", async () => {
  const claims = {
    sub: "user-1",
    membership_id: "membership-1",
    school_id: "school-1",
    role: "school_admin" as const,
    session_version: 1,
  };

  const token = await createAccessToken(claims);
  await expect(verifyAccessToken(token)).resolves.toMatchObject(claims);
});

test("expired access token is rejected", async () => {
  const token = await createAccessToken({
    sub: "user-1",
    membership_id: "membership-1",
    school_id: "school-1",
    role: "school_admin",
    session_version: 1,
    expiresIn: "0s",
  });

  await expect(verifyAccessToken(token)).rejects.toThrow();
});

test("access token with invalid session claims is rejected", async () => {
  const token = await createAccessToken({
    sub: "user-1",
    membership_id: "membership-1",
    school_id: "school-1",
    role: "parent",
    session_version: -1,
  });

  await expect(verifyAccessToken(token)).rejects.toThrow();
});

test("JWT module fails fast when ACCESS_TOKEN_SECRET is missing", async () => {
  const result = await runJwtImport({ ACCESS_TOKEN_SECRET: undefined });

  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain("ACCESS_TOKEN_SECRET");
});

test("JWT module fails fast when ACCESS_TOKEN_SECRET is too short", async () => {
  const result = await runJwtImport({ ACCESS_TOKEN_SECRET: "too-short" });

  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain("32");
});

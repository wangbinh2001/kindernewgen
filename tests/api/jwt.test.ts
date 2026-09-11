import { expect, test } from "bun:test";
import { createAccessToken, verifyAccessToken } from "../../src/auth/jwt";

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

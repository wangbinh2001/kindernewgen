import { Hono } from "hono";

export const app = new Hono();

app.get("/health", (c) =>
  c.json({ success: true, data: { status: "ok" }, error: null }),
);

export default { port: 3000, fetch: app.fetch };

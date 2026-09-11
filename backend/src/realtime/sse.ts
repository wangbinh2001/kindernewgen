import { streamSSE } from "hono/streaming";
import { Hono } from "hono";
import { requireAuth } from "../auth/middleware";
import type { AccessTokenClaims, TenantAccessTokenClaims } from "../auth/jwt";

type SSEClient = {
  schoolId: string;
  userId: string;
  send: (eventType: string, data: unknown) => void;
};

class RealtimeHub {
  private clients = new Set<SSEClient>();

  register(client: SSEClient): () => void {
    this.clients.add(client);
    return () => {
      this.clients.delete(client);
    };
  }

  sendToUser(userId: string, eventType: string, data: unknown) {
    for (const client of this.clients) {
      if (client.userId === userId) {
        client.send(eventType, data);
      }
    }
  }

  sendToSchool(schoolId: string, eventType: string, data: unknown) {
    for (const client of this.clients) {
      if (client.schoolId === schoolId) {
        client.send(eventType, data);
      }
    }
  }

  clientCount(): number {
    return this.clients.size;
  }
}

export const realtimeHub = new RealtimeHub();

export const sseRoutes = new Hono();

sseRoutes.get("/stream", requireAuth, async (context) => {
  const claims: AccessTokenClaims = context.get("auth").claims;
  if (
    claims.role === "context_selection" ||
    claims.role === "system_admin" ||
    !("school_id" in claims) ||
    !claims.school_id
  ) {
    return context.json(
      {
        success: false,
        data: null,
        error: { code: "FORBIDDEN", message: "Tenant access token required" },
      },
      403,
    );
  }

  const tenantClaims = claims as TenantAccessTokenClaims;
  const schoolId = tenantClaims.school_id;
  const userId = tenantClaims.sub;

  return streamSSE(context, async (stream) => {
    const unregister = realtimeHub.register({
      schoolId,
      userId,
      send: (eventType: string, data: unknown) => {
        stream.writeSSE({
          event: eventType,
          data: JSON.stringify(data),
        }).catch(() => {});
      },
    });

    // Gửi ping ban đầu xác nhận kết nối
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ userId, schoolId, connectedAt: new Date().toISOString() }),
    });

    // Heartbeat giữ kết nối sống
    const timer = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: "ping",
          data: JSON.stringify({ time: Date.now() }),
        });
      } catch {
        clearInterval(timer);
        unregister();
      }
    }, 15000);

    stream.onAbort(() => {
      clearInterval(timer);
      unregister();
    });

    // Chờ kết nối đóng
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });
  });
});

import type { Context } from "hono";

export function validationError(context: Context, message = "Invalid request") {
  return context.json(
    {
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR", message },
    },
    400,
  );
}

export function internalError(context: Context) {
  return context.json(
    { success: false, data: null, error: { code: "INTERNAL_ERROR" } },
    500,
  );
}

export function notFoundError(
  context: Context,
  message = "Resource not found",
) {
  return context.json(
    { success: false, data: null, error: { code: "NOT_FOUND", message } },
    404,
  );
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

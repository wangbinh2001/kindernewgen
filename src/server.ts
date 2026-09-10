import { Hono } from "hono";
import { authRoutes } from "./auth/routes";
import { classRoutes } from "./classes/routes";
import { schoolYearRoutes } from "./school-years/routes";
import { studentRoutes } from "./students/routes";
import { systemRoutes } from "./system/routes";
import {
  schoolSupportRoutes,
  systemSupportRoutes,
} from "./system/support-routes";
import { settingsRoutes } from "./settings/routes";
import { staffRoutes } from "./staff/routes";
import { optionalFeeRoutes } from "./optional-fees/routes";
import { attendanceRoutes } from "./attendance/routes";
import { feeScheduleRoutes } from "./tuition/fee-schedules-routes";
import { studentReductionRoutes } from "./tuition/student-reductions-routes";
import { paymentRoutes } from "./tuition/payments-routes";
import { calculationRoutes } from "./tuition/calculation-routes";
import { adjustmentRoutes } from "./tuition/adjustments-routes";
import { healthRoutes } from "./health/routes";
import { nutritionRoutes } from "./nutrition/routes";
import { menuRoutes } from "./nutrition/menu-routes";
import { groceryRoutes } from "./nutrition/grocery-routes";
import { timelineRoutes } from "./timeline/routes";
import { parentPortalRoutes, parentRoutes } from "./parent/routes";
import { parentRequestRoutes } from "./parent-requests/routes";
import { dashboardRoutes } from "./dashboard/routes";

export const app = new Hono();

app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/school/students", studentRoutes);
app.route("/api/v1/school/school-years", schoolYearRoutes);
app.route("/api/v1/school/classes", classRoutes);
app.route("/api/v1/system", systemRoutes);
app.route("/api/v1/system", systemSupportRoutes);
app.route("/api/v1/school/support", schoolSupportRoutes);
app.route("/api/v1/school/settings", settingsRoutes);
app.route("/api/v1/school/staff", staffRoutes);
app.route("/api/v1/school/optional-fees", optionalFeeRoutes);
app.route("/api/v1/school/attendance", attendanceRoutes);
app.route("/api/v1/school/fees", feeScheduleRoutes);
app.route("/api/v1/school/students", studentReductionRoutes);
app.route("/api/v1/school/tuition/payments", paymentRoutes);
app.route("/api/v1/school/tuition", calculationRoutes);
app.route("/api/v1/school/tuition", adjustmentRoutes);
app.route("/api/v1/school", healthRoutes);
app.route("/api/v1/school", nutritionRoutes);
app.route("/api/v1/school/menus", menuRoutes);
app.route("/api/v1/school", groceryRoutes);
app.route("/api/v1/school/timeline", timelineRoutes);
app.route("/api/v1/school/parent-requests", parentRequestRoutes);
app.route("/api/v1/school/dashboard", dashboardRoutes);
app.route("/api/v1/parent/requests", parentRoutes);
app.route("/api/v1/parent", parentPortalRoutes);
app.route("/api/v1/students", studentRoutes);

app.get("/health", (c) =>
  c.json({ success: true, data: { status: "ok" }, error: null }),
);

export default { port: 3000, fetch: app.fetch };

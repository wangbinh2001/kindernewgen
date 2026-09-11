type OpenApiOperation = {
  operationId: string;
  summary: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses: Record<string, { description: string }>;
};

const bearerSecurity = [{ bearerAuth: [] }];

const operation = (
  operationId: string,
  summary: string,
  tags: string[],
  secured = true,
): OpenApiOperation => ({
  operationId,
  summary,
  tags,
  ...(secured ? { security: bearerSecurity } : {}),
  responses: {
    "200": { description: "Successful response" },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Forbidden" },
    "404": { description: "Resource not found" },
  },
});

const idParameter = (name = "id") => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
});

const paths: Record<string, Record<string, OpenApiOperation>> = {};

const add = (
  path: string,
  method: string,
  operationId: string,
  summary: string,
  tags: string[],
  secured = true,
) => {
  paths[path] ??= {};
  const routeOperation = operation(operationId, summary, tags, secured);
  if (["post", "put", "patch"].includes(method)) {
    routeOperation.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { type: "object", additionalProperties: true },
        },
      },
    };
  }
  routeOperation.responses["500"] = { description: "Internal server error" };
  paths[path][method] = routeOperation;
};

add("/health", "get", "healthCheck", "Health check", ["System"], false);
add(
  "/api/v1/auth/login",
  "post",
  "login",
  "Log in to a school",
  ["Auth"],
  false,
);
add(
  "/api/v1/auth/admin/login",
  "post",
  "adminLogin",
  "Log in as system admin",
  ["Auth"],
  false,
);
add(
  "/api/v1/auth/forgot-password",
  "post",
  "forgotPassword",
  "Request password recovery guidance",
  ["Auth"],
  false,
);
add(
  "/api/v1/auth/reset-password",
  "post",
  "resetPassword",
  "Reset a password with a time-limited token",
  ["Auth"],
  false,
);
add(
  "/api/v1/auth/change-password",
  "post",
  "changePassword",
  "Change the current password",
  ["Auth"],
);
add("/api/v1/auth/logout", "post", "logout", "Log out", ["Auth"]);
add("/api/v1/auth/logout-all", "post", "logoutAll", "Revoke all sessions", [
  "Auth",
]);
add(
  "/api/v1/auth/select-context",
  "post",
  "selectContext",
  "Select a school context",
  ["Auth"],
);
add(
  "/api/v1/notifications",
  "get",
  "listNotifications",
  "List current user notifications",
  ["Notifications"],
);
add(
  "/api/v1/notifications/{id}/read",
  "patch",
  "markNotificationRead",
  "Mark a notification as read",
  ["Notifications"],
);
add(
  "/api/v1/notifications/read-all",
  "post",
  "markAllNotificationsRead",
  "Mark all notifications as read",
  ["Notifications"],
);
add(
  "/api/v1/school/storage/upload-url",
  "post",
  "createStorageUploadUrl",
  "Create a tenant-scoped upload URL",
  ["Storage"],
);
add(
  "/api/v1/school/storage/objects/{id}/content",
  "put",
  "uploadStorageObject",
  "Upload object content",
  ["Storage"],
);
add(
  "/api/v1/school/storage/objects/{id}/content",
  "get",
  "downloadStorageObject",
  "Download object content",
  ["Storage"],
);
add(
  "/api/v1/school/storage/objects/{id}",
  "get",
  "getStorageObject",
  "Get storage object metadata",
  ["Storage"],
);
add(
  "/api/v1/school/storage/objects/{id}",
  "delete",
  "deleteStorageObject",
  "Delete a storage object",
  ["Storage"],
);

add(
  "/api/v1/master-data/addresses/provinces",
  "get",
  "listProvinces",
  "List Vietnamese provinces",
  ["Master data"],
  false,
);
add(
  "/api/v1/master-data/addresses/wards",
  "get",
  "listWards",
  "List wards for a province",
  ["Master data"],
  false,
);

add(
  "/api/v1/school/members",
  "get",
  "listMemberships",
  "List school memberships",
  ["Memberships"],
);
add(
  "/api/v1/school/members/{id}",
  "get",
  "getMembership",
  "Get a school membership",
  ["Memberships"],
);
add(
  "/api/v1/school/members/{id}/role",
  "patch",
  "updateMembershipRole",
  "Update membership role",
  ["Memberships"],
);
add(
  "/api/v1/school/members/{id}/status",
  "patch",
  "updateMembershipStatus",
  "Update membership status",
  ["Memberships"],
);
add(
  "/api/v1/school/members/{id}",
  "delete",
  "revokeMembership",
  "Revoke a school membership",
  ["Memberships"],
);
add(
  "/api/v1/school/users/{id}/reset-password",
  "post",
  "resetUserPassword",
  "Issue a temporary password",
  ["Memberships"],
);

add(
  "/api/v1/school/reports",
  "post",
  "createReportJob",
  "Create an asynchronous report job",
  ["Reports"],
);
add("/api/v1/school/reports", "get", "listReportJobs", "List report jobs", [
  "Reports",
]);
add(
  "/api/v1/school/reports/{id}",
  "get",
  "getReportJob",
  "Get report job status",
  ["Reports"],
);
add(
  "/api/v1/school/reports/{id}/download",
  "get",
  "downloadReport",
  "Download a completed report",
  ["Reports"],
);
add(
  "/api/v1/realtime/stream",
  "get",
  "streamRealtimeEvents",
  "Subscribe to realtime invalidation events",
  ["Realtime"],
);

add("/api/v1/school/students", "get", "listStudents", "List students", [
  "Students",
]);
add("/api/v1/school/students", "post", "createStudent", "Create a student", [
  "Students",
]);
add("/api/v1/school/students/{id}", "get", "getStudent", "Get a student", [
  "Students",
]);
add(
  "/api/v1/school/students/{id}",
  "put",
  "updateStudent",
  "Update a student",
  ["Students"],
);
add(
  "/api/v1/school/students/{id}",
  "delete",
  "deleteStudent",
  "Delete a student",
  ["Students"],
);
add(
  "/api/v1/school/students/{id}/transfer-class",
  "post",
  "transferStudentClass",
  "Transfer a student",
  ["Students"],
);
add(
  "/api/v1/school/students/{id}/reduction",
  "get",
  "getStudentReduction",
  "Get a student reduction",
  ["Tuition"],
);
add(
  "/api/v1/school/students/{id}/reduction",
  "put",
  "upsertStudentReduction",
  "Save a student reduction",
  ["Tuition"],
);

add(
  "/api/v1/school/school-years",
  "get",
  "listSchoolYears",
  "List school years",
  ["School years"],
);
add(
  "/api/v1/school/school-years",
  "post",
  "createSchoolYear",
  "Create a school year",
  ["School years"],
);
add(
  "/api/v1/school/school-years/{id}",
  "get",
  "getSchoolYear",
  "Get a school year",
  ["School years"],
);
add(
  "/api/v1/school/school-years/{id}",
  "put",
  "updateSchoolYear",
  "Update a school year",
  ["School years"],
);
add(
  "/api/v1/school/school-years/{id}",
  "delete",
  "deleteSchoolYear",
  "Delete a school year",
  ["School years"],
);
add(
  "/api/v1/school/school-years/{id}/close",
  "patch",
  "closeSchoolYear",
  "Close a school year",
  ["School years"],
);
add(
  "/api/v1/school/school-years/{id}/activate",
  "post",
  "activateSchoolYear",
  "Activate a school year",
  ["School years"],
);

add("/api/v1/school/classes", "get", "listClasses", "List classes", [
  "Classes",
]);
add("/api/v1/school/classes", "post", "createClass", "Create a class", [
  "Classes",
]);
add("/api/v1/school/classes/{id}", "get", "getClass", "Get a class", [
  "Classes",
]);
add("/api/v1/school/classes/{id}", "put", "updateClass", "Update a class", [
  "Classes",
]);
add("/api/v1/school/classes/{id}", "delete", "deleteClass", "Delete a class", [
  "Classes",
]);
add(
  "/api/v1/school/classes/{id}/archive",
  "post",
  "archiveClass",
  "Archive a class",
  ["Classes"],
);
add(
  "/api/v1/school/classes/{id}/migrate",
  "post",
  "migrateClass",
  "Migrate a class to another school year",
  ["Classes"],
);

add("/api/v1/school/attendance", "get", "listAttendance", "List attendance", [
  "Attendance",
]);
add("/api/v1/school/attendance", "post", "saveAttendance", "Save attendance", [
  "Attendance",
]);
add(
  "/api/v1/school/attendance/{id}/adjust",
  "post",
  "adjustAttendance",
  "Adjust confirmed attendance",
  ["Attendance"],
);
add(
  "/api/v1/school/optional-fees",
  "get",
  "listOptionalFees",
  "List optional fees",
  ["Optional fees"],
);
add(
  "/api/v1/school/optional-fees",
  "post",
  "createOptionalFee",
  "Create an optional fee",
  ["Optional fees"],
);
add(
  "/api/v1/school/optional-fees/{id}",
  "put",
  "updateOptionalFee",
  "Update an optional fee",
  ["Optional fees"],
);
add(
  "/api/v1/school/optional-fees/{id}",
  "delete",
  "deleteOptionalFee",
  "Deactivate an optional fee",
  ["Optional fees"],
);
add("/api/v1/school/settings", "get", "getSettings", "Get school settings", [
  "Settings",
]);
add(
  "/api/v1/school/settings/{key}",
  "put",
  "upsertSetting",
  "Save a school setting",
  ["Settings"],
);
add("/api/v1/school/staff", "get", "listStaff", "List school staff", ["Staff"]);
add("/api/v1/school/staff", "post", "createStaff", "Create school staff", [
  "Staff",
]);
add(
  "/api/v1/school/staff/{id}/status",
  "patch",
  "updateStaffStatus",
  "Update staff status",
  ["Staff"],
);
add(
  "/api/v1/school/staff/{id}/assign-class",
  "post",
  "assignTeacherClass",
  "Assign a teacher to a class",
  ["Staff"],
);
add(
  "/api/v1/school/dashboard/stats",
  "get",
  "dashboardStats",
  "Get dashboard statistics",
  ["Dashboard"],
);
add(
  "/api/v1/school/dashboard/recent-activities",
  "get",
  "dashboardRecentActivities",
  "Get recent activities",
  ["Dashboard"],
);
add(
  "/api/v1/school/dashboard/alerts",
  "get",
  "dashboardAlerts",
  "Get dashboard alerts",
  ["Dashboard"],
);
add(
  "/api/v1/school/support/requests",
  "post",
  "createSupportRequest",
  "Create a support request",
  ["Support"],
);
add(
  "/api/v1/school/parent-requests",
  "get",
  "listParentRequests",
  "List parent requests",
  ["Parent requests"],
);
add(
  "/api/v1/school/parent-requests/{id}",
  "get",
  "getParentRequest",
  "Get a parent request",
  ["Parent requests"],
);
add(
  "/api/v1/school/parent-requests/{id}/resolve",
  "put",
  "resolveParentRequest",
  "Resolve a parent request",
  ["Parent requests"],
);
add(
  "/api/v1/school/parent-requests/{id}/reject",
  "put",
  "rejectParentRequest",
  "Reject a parent request",
  ["Parent requests"],
);
add(
  "/api/v1/school/parent-requests/{id}",
  "delete",
  "deleteParentRequest",
  "Delete a parent request",
  ["Parent requests"],
);

add("/api/v1/school/fees", "get", "listFeeSchedules", "List fee schedules", [
  "Tuition",
]);
add(
  "/api/v1/school/fees",
  "post",
  "createFeeSchedule",
  "Create a fee schedule",
  ["Tuition"],
);
add(
  "/api/v1/school/fees/{id}",
  "put",
  "updateFeeSchedule",
  "Update a fee schedule",
  ["Tuition"],
);
add(
  "/api/v1/school/fees/{id}",
  "delete",
  "deleteFeeSchedule",
  "Deactivate a fee schedule",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/payments",
  "post",
  "createPayment",
  "Record a payment",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/payments",
  "get",
  "listPayments",
  "List student payments and balances",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/payments/{id}/receipt",
  "get",
  "getPaymentReceipt",
  "Get a payment receipt",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/calculate",
  "post",
  "calculateTuition",
  "Calculate tuition",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/confirm",
  "post",
  "confirmTuition",
  "Confirm tuition",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/history",
  "get",
  "listTuitionHistory",
  "List confirmed tuition history",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/history/{id}",
  "get",
  "getTuitionHistory",
  "Get tuition history detail",
  ["Tuition"],
);
add(
  "/api/v1/school/tuition/history/{id}/adjust",
  "post",
  "adjustTuition",
  "Adjust confirmed tuition",
  ["Tuition"],
);

add(
  "/api/v1/school/health",
  "get",
  "listHealthRecords",
  "List latest health records",
  ["Health"],
);
add(
  "/api/v1/school/health",
  "post",
  "createHealthRecord",
  "Create a health record",
  ["Health"],
);
add(
  "/api/v1/school/health/{id}/void",
  "post",
  "voidHealthRecord",
  "Void a health record",
  ["Health"],
);
add(
  "/api/v1/school/students/{id}/health-history",
  "get",
  "studentHealthHistory",
  "List student health history",
  ["Health"],
);
add("/api/v1/school/food-items", "get", "listFoodItems", "List food items", [
  "Nutrition",
]);
add(
  "/api/v1/school/food-items",
  "post",
  "createFoodItem",
  "Create a food item",
  ["Nutrition"],
);
add(
  "/api/v1/school/ingredients",
  "get",
  "listIngredients",
  "List ingredients",
  ["Nutrition"],
);
add(
  "/api/v1/school/ingredients",
  "post",
  "createIngredient",
  "Create an ingredient",
  ["Nutrition"],
);
add(
  "/api/v1/school/recipes",
  "post",
  "upsertRecipes",
  "Replace a food recipe",
  ["Nutrition"],
);
add("/api/v1/school/menus", "get", "listMenus", "List menus", ["Nutrition"]);
add("/api/v1/school/menus", "post", "upsertMenu", "Replace a menu for a date", [
  "Nutrition",
]);
add(
  "/api/v1/school/grocery-sheets/generate",
  "post",
  "generateGrocerySheet",
  "Generate a grocery sheet",
  ["Nutrition"],
);
add(
  "/api/v1/school/grocery-sheets/{id}",
  "get",
  "getGrocerySheet",
  "Get a grocery sheet",
  ["Nutrition"],
);
add(
  "/api/v1/school/operating-costs",
  "get",
  "listOperatingCosts",
  "List operating costs",
  ["Nutrition"],
);
add(
  "/api/v1/school/operating-costs",
  "post",
  "createOperatingCost",
  "Create an operating cost",
  ["Nutrition"],
);
add(
  "/api/v1/school/operating-costs/{id}",
  "put",
  "updateOperatingCost",
  "Update an operating cost",
  ["Nutrition"],
);
add(
  "/api/v1/school/operating-costs/{id}",
  "delete",
  "deleteOperatingCost",
  "Delete an operating cost",
  ["Nutrition"],
);

add(
  "/api/v1/school/timeline",
  "post",
  "createTimelinePost",
  "Create a timeline post",
  ["Timeline"],
);
add(
  "/api/v1/school/timeline/class/{class_id}",
  "get",
  "classTimeline",
  "List class timeline",
  ["Timeline"],
);
add(
  "/api/v1/school/timeline/student/{student_id}",
  "get",
  "studentTimeline",
  "List student timeline",
  ["Timeline"],
);
add(
  "/api/v1/school/timeline/{id}",
  "put",
  "updateTimelinePost",
  "Update a timeline post",
  ["Timeline"],
);
add(
  "/api/v1/school/timeline/{id}",
  "delete",
  "deleteTimelinePost",
  "Delete a timeline post",
  ["Timeline"],
);

add(
  "/api/v1/parent/children",
  "get",
  "listParentChildren",
  "List the parent's children",
  ["Parent portal"],
);
add(
  "/api/v1/parent/children/{id}",
  "get",
  "getParentChild",
  "Get a child profile",
  ["Parent portal"],
);
add(
  "/api/v1/parent/children/{id}/attendance",
  "get",
  "parentChildAttendance",
  "Get child attendance",
  ["Parent portal"],
);
add(
  "/api/v1/parent/children/{id}/tuition",
  "get",
  "parentChildTuition",
  "Get child tuition",
  ["Parent portal"],
);
add(
  "/api/v1/parent/children/{id}/health",
  "get",
  "parentChildHealth",
  "Get child health",
  ["Parent portal"],
);
add(
  "/api/v1/parent/children/{id}/timeline",
  "get",
  "parentChildTimeline",
  "Get child timeline",
  ["Parent portal"],
);
add("/api/v1/parent/menu", "get", "parentMenu", "Get the school menu", [
  "Parent portal",
]);
add(
  "/api/v1/parent/change-password",
  "post",
  "parentChangePassword",
  "Change parent password",
  ["Parent portal"],
);
add(
  "/api/v1/parent/requests",
  "post",
  "createParentRequest",
  "Create a parent request",
  ["Parent requests"],
);
add(
  "/api/v1/parent/requests",
  "get",
  "listMyParentRequests",
  "List my parent requests",
  ["Parent requests"],
);
add(
  "/api/v1/parent/requests/{id}",
  "delete",
  "cancelParentRequest",
  "Cancel a pending parent request",
  ["Parent requests"],
);

add("/api/v1/system/admins", "get", "listSystemAdmins", "List system admins", [
  "System admin",
]);
add(
  "/api/v1/system/admins",
  "post",
  "createSystemAdmin",
  "Create a system admin",
  ["System admin"],
);
add(
  "/api/v1/system/admins/{id}",
  "patch",
  "updateSystemAdmin",
  "Update a system admin",
  ["System admin"],
);
add(
  "/api/v1/system/admins/{id}/status",
  "patch",
  "updateSystemAdminStatus",
  "Update system admin status",
  ["System admin"],
);
add("/api/v1/system/schools", "get", "listSchools", "List schools", [
  "System admin",
]);
add("/api/v1/system/schools", "post", "createSchool", "Create a school", [
  "System admin",
]);
add("/api/v1/system/schools/{id}", "get", "getSchool", "Get a school", [
  "System admin",
]);
add("/api/v1/system/schools/{id}", "patch", "updateSchool", "Update a school", [
  "System admin",
]);
add(
  "/api/v1/system/schools/{id}/status",
  "patch",
  "updateSchoolStatus",
  "Update school status",
  ["System admin"],
);
add(
  "/api/v1/system/support/requests",
  "get",
  "listSupportRequests",
  "List support requests",
  ["Support"],
);
add(
  "/api/v1/system/support/requests/{id}/approve",
  "patch",
  "approveSupportRequest",
  "Approve a support request",
  ["Support"],
);
add(
  "/api/v1/system/support/session/start",
  "post",
  "startSupportSession",
  "Start a support session",
  ["Support"],
);
add(
  "/api/v1/system/support/session/end",
  "post",
  "endSupportSession",
  "End a support session",
  ["Support"],
);
add("/api/v1/system/audit-logs", "get", "listAuditLogs", "List audit logs", [
  "Audit",
]);

for (const [path, pathOperations] of Object.entries(paths)) {
  for (const pathOperation of Object.values(pathOperations)) {
    const parameterNames = [...path.matchAll(/\{([^}]+)\}/g)].map(
      ([, name]) => name,
    );
    if (parameterNames.length > 0) {
      pathOperation.parameters = parameterNames.map((name) =>
        idParameter(name),
      );
    }
  }
}

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "KinderNewGenz API",
    version: "1.0.0",
    description: "REST API for KinderNewGenz school and parent operations.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "Auth", description: "Authentication and sessions" },
    { name: "Students", description: "Student profiles and enrollment" },
    { name: "Parent portal", description: "Parent-only read APIs" },
    { name: "Tuition", description: "Fees, payments, and balances" },
    { name: "System admin", description: "Platform administration" },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      ApiSuccess: {
        type: "object",
        required: ["success", "data", "error"],
        properties: {
          success: { type: "boolean", example: true },
          data: { nullable: true },
          error: { nullable: true },
        },
      },
      ApiError: {
        type: "object",
        required: ["success", "data", "error"],
        properties: {
          success: { type: "boolean", example: false },
          data: { type: "null" },
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

export const swaggerUiHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KinderNewGenz API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => SwaggerUIBundle({ url: "/openapi.json", dom_id: "#swagger-ui" });
    </script>
  </body>
</html>`;

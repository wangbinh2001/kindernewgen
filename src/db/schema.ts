import {
  pgTable,
  text,
  timestamp,
  boolean,
  unique,
  integer,
  date,
  jsonb,
  numeric,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// --- Global / Discovery tables (No RLS) ---

export const systemAdmins = pgTable("system_admins", {
  id: text("id").primaryKey(),
  username: text("username").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const schools = pgTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").unique().notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  createdBy: text("created_by").references(() => systemAdmins.id),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const schoolYears = pgTable(
  "school_years",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    status: text("status").default("coming_soon").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("school_years_school_name_unique").on(t.schoolId, t.name)],
);

export const schoolSettings = pgTable(
  "school_settings",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    settingKey: text("setting_key").notNull(),
    settingValue: jsonb("setting_value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("school_settings_school_key_unique").on(t.schoolId, t.settingKey),
  ],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    globalPhone: text("global_phone").unique().notNull(),
    username: text("username"),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    mustChangePassword: boolean("must_change_password")
      .default(false)
      .notNull(),
    sessionVersion: integer("session_version").default(1).notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.username)],
);

export const classes = pgTable(
  "classes",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    schoolYearId: text("school_year_id")
      .references(() => schoolYears.id)
      .notNull(),
    name: text("name").notNull(),
    teacherId: text("teacher_id").references(() => users.id),
    maxStudents: integer("max_students"),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("classes_school_year_name_unique").on(
      t.schoolId,
      t.schoolYearId,
      t.name,
    ),
  ],
);

export const teacherAssignments = pgTable("teacher_assignments", {
  id: text("id").primaryKey(),
  schoolId: text("school_id")
    .references(() => schools.id)
    .notNull(),
  teacherId: text("teacher_id")
    .references(() => users.id)
    .notNull(),
  classId: text("class_id")
    .references(() => classes.id)
    .notNull(),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  status: text("status").default("active").notNull(),
});

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    role: text("role").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique().on(t.userId, t.schoolId, t.role)],
);

// --- Tenant tables (RLS MUST BE ENFORCED) ---
// To be added in upcoming phases (students, classes, attendance, etc.)

export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    fullName: text("full_name").notNull(),
    status: text("status").default("active").notNull(),
    dob: date("dob", { mode: "string" }),
    gender: text("gender"),
    cccd: text("cccd"),
    cccdIssueDate: date("cccd_issue_date", { mode: "string" }),
    cccdIssuePlace: text("cccd_issue_place"),
    address: text("address"),
    currentClassId: text("current_class_id").references(() => classes.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("students_school_id_cccd_unique").on(t.schoolId, t.cccd)],
);

export const responsiblePersons = pgTable("responsible_persons", {
  id: text("id").primaryKey(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  type: text("type").notNull(),
  fullName: text("full_name").notNull(),
  yearOfBirth: integer("year_of_birth").notNull(),
  cccd: text("cccd").notNull(),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const parentChildren = pgTable(
  "parent_children",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id")
      .references(() => users.id)
      .notNull(),
    childId: text("child_id")
      .references(() => students.id)
      .notNull(),
    linkedAt: timestamp("linked_at").defaultNow().notNull(),
  },
  (t) => [
    unique("parent_children_parent_child_unique").on(t.parentId, t.childId),
  ],
);

export const classStudents = pgTable("class_students", {
  id: text("id").primaryKey(),
  schoolId: text("school_id")
    .references(() => schools.id)
    .notNull(),
  classId: text("class_id")
    .references(() => classes.id)
    .notNull(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  schoolYearId: text("school_year_id")
    .references(() => schoolYears.id)
    .notNull(),
  enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const classHistory = pgTable("class_history", {
  id: text("id").primaryKey(),
  schoolId: text("school_id")
    .references(() => schools.id)
    .notNull(),
  studentId: text("student_id")
    .references(() => students.id)
    .notNull(),
  classId: text("class_id")
    .references(() => classes.id)
    .notNull(),
  schoolYearId: text("school_year_id")
    .references(() => schoolYears.id)
    .notNull(),
  enrolledAt: timestamp("enrolled_at").notNull(),
  leftAt: timestamp("left_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const optionalFees = pgTable(
  "optional_fees",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("optional_fees_school_name_unique").on(t.schoolId, t.name),
    index("optional_fees_school_idx").on(t.schoolId),
  ],
);

export const attendance = pgTable(
  "attendance",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    classId: text("class_id")
      .references(() => classes.id)
      .notNull(),
    date: date("date", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    note: text("note"),
    checkInTime: text("check_in_time"),
    checkOutTime: text("check_out_time"),
    overtimeStart: text("overtime_start"),
    overtimeEnd: text("overtime_end"),
    overtimeHours: numeric("overtime_hours", { precision: 6, scale: 2 }),
    state: text("state").default("draft").notNull(),
    voidedReason: text("voided_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    updatedBy: text("updated_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("attendance_school_student_date_live_unique")
      .on(t.schoolId, t.studentId, t.date)
      .where(sql`${t.state} <> 'voided'`),
    index("attendance_school_date_class_idx").on(t.schoolId, t.date, t.classId),
  ],
);

export const attendanceOptionalFees = pgTable(
  "attendance_optional_fees",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    attendanceId: text("attendance_id")
      .references(() => attendance.id)
      .notNull(),
    optionalFeeId: text("optional_fee_id")
      .references(() => optionalFees.id)
      .notNull(),
    feeSnapshotAmount: integer("fee_snapshot_amount").notNull(),
  },
  (t) => [
    unique("attendance_optional_fees_unique").on(
      t.attendanceId,
      t.optionalFeeId,
    ),
    index("attendance_optional_fees_school_idx").on(t.schoolId),
  ],
);

export const feeSchedules = pgTable(
  "fee_schedules",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    name: text("name").notNull(),
    amount: integer("amount").notNull(),
    type: text("type").notNull(),
    classId: text("class_id").references(() => classes.id),
    cycle: text("cycle").default("monthly").notNull(),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("fee_schedules_school_idx").on(t.schoolId),
    unique("fee_schedules_school_name_unique").on(t.schoolId, t.name),
  ],
);

export const studentReductions = pgTable(
  "student_reductions",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    reductionType: text("reduction_type").notNull(),
    reductionValue: integer("reduction_value").notNull(),
    status: text("status").default("active").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("student_reductions_school_student_unique").on(
      t.schoolId,
      t.studentId,
    ),
    index("student_reductions_school_idx").on(t.schoolId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    amount: integer("amount").notNull(),
    method: text("method").notNull(),
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    receivedBy: text("received_by").references(() => schoolMemberships.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("payments_school_student_idx").on(t.schoolId, t.studentId)],
);

export const studentBalances = pgTable(
  "student_balances",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    period: date("period", { mode: "string" }).notNull(),
    openingAmount: integer("opening_amount").notNull(),
    charges: integer("charges").default(0).notNull(),
    payments: integer("payments").default(0).notNull(),
    adjustments: integer("adjustments").default(0).notNull(),
    closingAmount: integer("closing_amount").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("student_balances_school_student_period_unique").on(
      t.schoolId,
      t.studentId,
      t.period,
    ),
    index("student_balances_school_period_idx").on(t.schoolId, t.period),
  ],
);

export const tuitionHistory = pgTable(
  "tuition_history",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    month: date("month", { mode: "string" }).notNull(),
    feeSnapshot: jsonb("fee_snapshot").notNull(),
    reductionType: text("reduction_type"),
    reductionValue: integer("reduction_value"),
    totalFees: integer("total_fees").notNull(),
    totalReduction: integer("total_reduction").notNull(),
    finalAmount: integer("final_amount").notNull(),
    note: text("note"),
    state: text("state").default("draft").notNull(),
    voidedReason: text("voided_reason"),
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: text("confirmed_by").references(() => schoolMemberships.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("tuition_history_school_student_month_unique").on(
      t.schoolId,
      t.studentId,
      t.month,
    ),
    index("tuition_history_school_month_idx").on(t.schoolId, t.month),
  ],
);

export const tuitionItems = pgTable(
  "tuition_items",
  {
    id: text("id").primaryKey(),
    tuitionHistoryId: text("tuition_history_id")
      .references(() => tuitionHistory.id)
      .notNull(),
    feeType: text("fee_type").notNull(),
    description: text("description").notNull(),
    amount: integer("amount").notNull(),
  },
  (t) => [index("tuition_items_history_idx").on(t.tuitionHistoryId)],
);

export const tuitionAdjustments = pgTable(
  "tuition_adjustments",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    tuitionHistoryId: text("tuition_history_id")
      .references(() => tuitionHistory.id)
      .notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by")
      .references(() => users.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("tuition_adjustments_school_idx").on(t.schoolId),
    index("tuition_adjustments_history_idx").on(t.tuitionHistoryId),
  ],
);

export const healthRecords = pgTable(
  "health_records",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    date: date("date", { mode: "string" }).notNull(),
    height: numeric("height", { precision: 6, scale: 2 }).notNull(),
    weight: numeric("weight", { precision: 6, scale: 2 }).notNull(),
    bmi: numeric("bmi", { precision: 6, scale: 2 }).notNull(),
    whoStandardVersion: text("who_standard_version"),
    ageMonths: integer("age_months").notNull(),
    classification: text("classification"),
    note: text("note"),
    createdBy: text("created_by")
      .references(() => schoolMemberships.id)
      .notNull(),
    state: text("state").default("active").notNull(),
    voidedReason: text("voided_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("health_records_school_student_date_idx").on(
      t.schoolId,
      t.studentId,
      t.date,
    ),
  ],
);

export const foodItems = pgTable(
  "food_items",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("food_items_school_name_unique").on(t.schoolId, t.name),
    index("food_items_school_idx").on(t.schoolId),
  ],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    name: text("name").notNull(),
    unit: text("unit").notNull(),
    pricePerUnit: numeric("price_per_unit", {
      precision: 12,
      scale: 4,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("ingredients_school_name_unique").on(t.schoolId, t.name),
    index("ingredients_school_idx").on(t.schoolId),
  ],
);

export const recipes = pgTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    foodItemId: text("food_item_id")
      .references(() => foodItems.id)
      .notNull(),
    ingredientId: text("ingredient_id")
      .references(() => ingredients.id)
      .notNull(),
    quantityPerStudent: numeric("quantity_per_student", {
      precision: 12,
      scale: 4,
    }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("recipes_food_ingredient_unique").on(t.foodItemId, t.ingredientId),
    index("recipes_food_item_idx").on(t.foodItemId),
  ],
);

export const menus = pgTable(
  "menus",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    date: date("date", { mode: "string" }).notNull(),
    mealType: text("meal_type").notNull(),
    foodItemId: text("food_item_id")
      .references(() => foodItems.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("menus_school_date_meal_food_unique").on(
      t.schoolId,
      t.date,
      t.mealType,
      t.foodItemId,
    ),
    index("menus_school_date_idx").on(t.schoolId, t.date),
  ],
);

export const grocerySheets = pgTable(
  "grocery_sheets",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    totalStudents: integer("total_students").notNull(),
    totalFoodCost: numeric("total_food_cost", {
      precision: 14,
      scale: 2,
    }).notNull(),
    electricityCost: numeric("electricity_cost", {
      precision: 14,
      scale: 2,
    }).notNull(),
    gasCost: numeric("gas_cost", { precision: 14, scale: 2 }).notNull(),
    estimatedTotal: numeric("estimated_total", {
      precision: 14,
      scale: 2,
    }).notNull(),
    actualTotal: numeric("actual_total", { precision: 14, scale: 2 }),
    status: text("status").default("draft").notNull(),
    generatedAt: timestamp("generated_at").defaultNow().notNull(),
  },
  (t) => [index("grocery_sheets_school_idx").on(t.schoolId)],
);

export const grocerySheetItems = pgTable(
  "grocery_sheet_items",
  {
    id: text("id").primaryKey(),
    grocerySheetId: text("grocery_sheet_id")
      .references(() => grocerySheets.id)
      .notNull(),
    ingredientId: text("ingredient_id")
      .references(() => ingredients.id)
      .notNull(),
    totalQuantity: numeric("total_quantity", {
      precision: 14,
      scale: 4,
    }).notNull(),
    unit: text("unit").notNull(),
    totalPrice: numeric("total_price", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
  },
  (t) => [index("grocery_sheet_items_sheet_idx").on(t.grocerySheetId)],
);

export const operatingCosts = pgTable(
  "operating_costs",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    month: date("month", { mode: "string" }).notNull(),
    electricityCost: numeric("electricity_cost", {
      precision: 14,
      scale: 2,
    }).notNull(),
    gasCost: numeric("gas_cost", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("operating_costs_school_month_unique").on(t.schoolId, t.month),
    index("operating_costs_school_idx").on(t.schoolId),
  ],
);

export const timelinePosts = pgTable(
  "timeline_posts",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    authorMembershipId: text("author_membership_id")
      .references(() => schoolMemberships.id)
      .notNull(),
    type: text("type").notNull(),
    classId: text("class_id").references(() => classes.id),
    studentId: text("student_id").references(() => students.id),
    content: text("content").notNull(),
    note: text("note"),
    status: text("status").default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("timeline_posts_school_created_idx").on(t.schoolId, t.createdAt),
    index("timeline_posts_school_class_idx").on(t.schoolId, t.classId),
    index("timeline_posts_school_student_idx").on(t.schoolId, t.studentId),
  ],
);

export const timelineMedia = pgTable(
  "timeline_media",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    postId: text("post_id")
      .references(() => timelinePosts.id)
      .notNull(),
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type").notNull(),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("timeline_media_school_post_idx").on(t.schoolId, t.postId)],
);

export const timelineTags = pgTable(
  "timeline_tags",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    postId: text("post_id")
      .references(() => timelinePosts.id)
      .notNull(),
    studentId: text("student_id")
      .references(() => students.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("timeline_tags_post_student_unique").on(t.postId, t.studentId),
    index("timeline_tags_school_student_idx").on(t.schoolId, t.studentId),
  ],
);

export const timelineEditHistory = pgTable(
  "timeline_edit_history",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    postId: text("post_id")
      .references(() => timelinePosts.id)
      .notNull(),
    editorId: text("editor_id")
      .references(() => users.id)
      .notNull(),
    oldContent: text("old_content").notNull(),
    newContent: text("new_content").notNull(),
    editedAt: timestamp("edited_at").defaultNow().notNull(),
  },
  (t) => [
    index("timeline_edit_history_school_post_idx").on(t.schoolId, t.postId),
  ],
);

export const parentRequests = pgTable(
  "parent_requests",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    parentId: text("parent_id")
      .references(() => users.id)
      .notNull(),
    childId: text("child_id")
      .references(() => students.id)
      .notNull(),
    type: text("type").notNull(),
    content: text("content").notNull(),
    urgent: boolean("urgent").default(false).notNull(),
    status: text("status").default("pending").notNull(),
    resolvedBy: text("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at"),
    response: text("response"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("parent_requests_school_status_idx").on(t.schoolId, t.status),
    index("parent_requests_school_child_idx").on(t.schoolId, t.childId),
  ],
);

export const parentRequestAttachments = pgTable(
  "parent_request_attachments",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    requestId: text("request_id")
      .references(() => parentRequests.id)
      .notNull(),
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type").notNull(),
    fileName: text("file_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("parent_request_attachments_school_request_idx").on(
      t.schoolId,
      t.requestId,
    ),
  ],
);

export const parentRequestHistory = pgTable(
  "parent_request_history",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    requestId: text("request_id")
      .references(() => parentRequests.id)
      .notNull(),
    status: text("status").notNull(),
    changedBy: text("changed_by")
      .references(() => users.id)
      .notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("parent_request_history_school_request_idx").on(
      t.schoolId,
      t.requestId,
    ),
  ],
);

export const supportRequests = pgTable(
  "support_requests",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .references(() => schools.id)
      .notNull(),
    requesterId: text("requester_id")
      .references(() => users.id)
      .notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    status: text("status").default("pending").notNull(),
    approvedBy: text("approved_by").references(() => systemAdmins.id),
    approvedAt: timestamp("approved_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("support_requests_school_status_idx").on(t.schoolId, t.status),
    index("support_requests_status_created_idx").on(t.status, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    schoolId: text("school_id").references(() => schools.id),
    supportSessionId: text("support_session_id").references(
      () => supportRequests.id,
    ),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_school_timestamp_idx").on(t.schoolId, t.timestamp),
    index("audit_logs_actor_timestamp_idx").on(t.actorType, t.timestamp),
    index("audit_logs_action_timestamp_idx").on(t.action, t.timestamp),
  ],
);

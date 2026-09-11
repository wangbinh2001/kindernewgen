import { Hono } from "hono";
import type { Context } from "hono";
import Papa from "papaparse";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware";
import type { TenantAccessTokenClaims } from "../auth/jwt";
import { registerParent } from "../auth/register";
import {
  classes,
  classStudents,
  parentChildren,
  responsiblePersons,
  studentProfiles,
  students,
} from "../db/schema";
import { withTenant, type TenantTransaction } from "../db/tenant";
import { addAddressPairIssue } from "../validation/vietnam-address";
import { and, eq } from "drizzle-orm";

export const importRoutes = new Hono();

// Helper parsing dates from DD/MM/YYYY to YYYY-MM-DD
export function parseDate(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Supports DD/MM/YYYY or YYYY-MM-DD
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = dmyMatch[1]!.padStart(2, "0");
    const month = dmyMatch[2]!.padStart(2, "0");
    const year = dmyMatch[3]!;
    return `${year}-${month}-${day}`;
  }

  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (ymdMatch) {
    return trimmed;
  }

  return null;
}

const dateRegexSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((val) => {
    const [year, month, day] = val.split("-").map(Number);
    const d = new Date(Date.UTC(year!, month! - 1, day));
    return (
      d.getUTCFullYear() === year &&
      d.getUTCMonth() === month! - 1 &&
      d.getUTCDate() === day
    );
  }, "Ngày không hợp lệ");

const studentAddressPairs = [
  ["transferredFromProvince", "transferredFromCommune"],
  ["birthPlaceProvince", "birthPlaceCommune"],
  ["birthCertProvince", "birthCertCommune"],
  ["nativePlaceProvince", "nativePlaceCommune"],
  ["permanentProvince", "permanentCommune"],
  ["currentProvince", "currentCommune"],
] as const;

export const csvRowSchema = z
  .object({
    className: z.string().trim().optional(),
    studentCode: z.string().trim().optional(),
    fullName: z.string().trim().min(1, "Họ và tên không được để trống"),
    dob: dateRegexSchema,
    gender: z.enum(["male", "female", "other"]),
    status: z.string().trim().optional(),
    statusDate: dateRegexSchema.nullable().optional(),
    transferredFromProvince: z.string().trim().min(1).optional(),
    transferredFromCommune: z.string().trim().min(1).optional(),
    dropoutReason: z.string().trim().optional(),
    ethnicity: z.string().trim().optional(),
    nationality: z.string().trim().optional(),
    religion: z.string().trim().optional(),
    permanentProvince: z.string().trim().min(1).optional(),
    permanentCommune: z.string().trim().min(1).optional(),
    permanentHamlet: z.string().trim().optional(),
    nativePlaceProvince: z.string().trim().min(1).optional(),
    nativePlaceCommune: z.string().trim().min(1).optional(),
    nativePlaceVillage: z.string().trim().optional(),
    birthCertProvince: z.string().trim().min(1).optional(),
    birthCertCommune: z.string().trim().min(1).optional(),
    birthPlaceProvince: z.string().trim().min(1).optional(),
    birthPlaceCommune: z.string().trim().min(1).optional(),
    birthPlace: z.string().trim().optional(),
    currentAddressDetail: z.string().trim().optional(),
    currentProvince: z.string().trim().min(1).optional(),
    currentCommune: z.string().trim().min(1).optional(),
    currentHamlet: z.string().trim().optional(),
    contactPhone: z.string().trim().optional(),
    passportNumber: z.string().trim().optional(),
    passportIssuePlace: z.string().trim().optional(),
    passportIssueDate: dateRegexSchema.nullable().optional(),
    cccd: z
      .string()
      .trim()
      .regex(/^(\d{9}|\d{12})$/, "CCCD/Định danh phải có 9 hoặc 12 chữ số"),
    cccdIssuePlace: z.string().trim().optional(),
    cccdIssueDate: dateRegexSchema.nullable().optional(),
    personalId: z.string().trim().optional(),
    area: z.string().trim().optional(),
    disabilityType: z.string().trim().optional(),
    policyTarget: z.string().trim().optional(),
    tuitionExempt: z.boolean().optional(),
    tuitionReduced: z.boolean().optional(),
    studyCostSupport: z.boolean().optional(),
    lunchSupport: z.boolean().optional(),
    languageFamiliarization: z.boolean().optional(),
    isNewlyEnrolled: z.boolean().optional(),
    enrolledDate: dateRegexSchema.nullable().optional(),
    isFullDay: z.boolean().optional(),
    isBoardingClass: z.boolean().optional(),
    isBoarding: z.boolean().optional(),
    motherEthnicity: z.string().trim().optional(),
    fatherEthnicity: z.string().trim().optional(),
    knowsSwimming: z.boolean().optional(),
    eyeDisease: z.boolean().optional(),
    parentHasSmartphone: z.boolean().optional(),
    parentHasComputerInternet: z.boolean().optional(),
    childDevelopmentNotes: z.string().trim().optional(),

    // Cha
    hasNoFather: z.boolean().optional(),
    fatherName: z.string().trim().optional(),
    fatherJob: z.string().trim().optional(),
    fatherBirthYear: z.number().int().optional(),
    fatherPhone: z.string().trim().optional(),
    fatherCccd: z.string().trim().optional(),

    // Mẹ
    hasNoMother: z.boolean().optional(),
    motherName: z.string().trim().optional(),
    motherJob: z.string().trim().optional(),
    motherBirthYear: z.number().int().optional(),
    motherPhone: z.string().trim().optional(),
    motherCccd: z.string().trim().optional(),

    // Giám hộ
    guardianName: z.string().trim().optional(),
    guardianJob: z.string().trim().optional(),
    guardianBirthYear: z.number().int().optional(),
    guardianPhone: z.string().trim().optional(),
    guardianGender: z.string().trim().optional(),
    guardianCccd: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    for (const [provinceKey, communeKey] of studentAddressPairs) {
      addAddressPairIssue(
        data as Record<string, unknown>,
        ctx,
        provinceKey,
        communeKey,
      );
    }

    // Cha validation
    if (data.fatherName && !data.hasNoFather) {
      if (!data.fatherPhone || !/^0\d{9}$/.test(data.fatherPhone)) {
        ctx.addIssue({
          code: "custom",
          path: ["fatherPhone"],
          message: "Số điện thoại cha không đúng định dạng",
        });
      }
      if (
        !data.fatherBirthYear ||
        data.fatherBirthYear < 1900 ||
        data.fatherBirthYear > new Date().getFullYear()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["fatherBirthYear"],
          message: "Năm sinh cha không hợp lệ",
        });
      }
      if (!data.fatherCccd || !/^(\d{9}|\d{12})$/.test(data.fatherCccd)) {
        ctx.addIssue({
          code: "custom",
          path: ["fatherCccd"],
          message: "CCCD cha phải gồm 9 hoặc 12 số",
        });
      }
    }

    // Mẹ validation
    if (data.motherName && !data.hasNoMother) {
      if (!data.motherPhone || !/^0\d{9}$/.test(data.motherPhone)) {
        ctx.addIssue({
          code: "custom",
          path: ["motherPhone"],
          message: "Số điện thoại mẹ không đúng định dạng",
        });
      }
      if (
        !data.motherBirthYear ||
        data.motherBirthYear < 1900 ||
        data.motherBirthYear > new Date().getFullYear()
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["motherBirthYear"],
          message: "Năm sinh mẹ không hợp lệ",
        });
      }
      if (!data.motherCccd || !/^(\d{9}|\d{12})$/.test(data.motherCccd)) {
        ctx.addIssue({
          code: "custom",
          path: ["motherCccd"],
          message: "CCCD mẹ phải gồm 9 hoặc 12 số",
        });
      }
    }
  });

export function mapRowToSchema(row: string[]) {
  const getStr = (index: number) => {
    const val = row[index]?.trim();
    return val ? val : undefined;
  };
  const getBool = (index: number) => {
    const val = row[index]?.trim().toLowerCase();
    return val === "x" || val === "true" || val === "1";
  };
  const getInt = (index: number) => {
    const val = row[index]?.trim();
    if (!val) return undefined;
    const n = parseInt(val, 10);
    return isNaN(n) ? undefined : n;
  };

  const genderStr = row[5]?.trim().toLowerCase();
  const gender =
    genderStr === "nam" ? "male" : genderStr === "nữ" ? "female" : "other";

  return {
    className: getStr(1),
    studentCode: getStr(2),
    fullName: getStr(3) || "",
    dob: parseDate(row[4]) || row[4] || "",
    gender,
    status: getStr(6),
    statusDate: parseDate(row[7]),
    transferredFromProvince: getStr(8),
    transferredFromCommune: getStr(9),
    dropoutReason: getStr(10),
    ethnicity: getStr(11),
    nationality: getStr(12),
    religion: getStr(13),
    permanentProvince: getStr(14),
    permanentCommune: getStr(16),
    permanentHamlet: getStr(17),
    nativePlaceProvince: getStr(18),
    nativePlaceCommune: getStr(20),
    nativePlaceVillage: getStr(21),
    birthCertProvince: getStr(22),
    birthCertCommune: getStr(24),
    birthPlaceProvince: getStr(25),
    birthPlaceCommune: getStr(27),
    birthPlace: getStr(28),
    currentAddressDetail: getStr(29),
    currentProvince: getStr(30),
    currentCommune: getStr(32),
    currentHamlet: getStr(33),
    contactPhone: getStr(34),
    passportNumber: getStr(35),
    passportIssuePlace: getStr(36),
    passportIssueDate: parseDate(row[37]),
    cccd: getStr(38) || "",
    cccdIssuePlace: getStr(39),
    cccdIssueDate: parseDate(row[40]),
    personalId: getStr(41),
    area: getStr(42),
    disabilityType: getStr(43),
    policyTarget: getStr(44),
    tuitionExempt: getBool(45),
    tuitionReduced: getBool(46),
    studyCostSupport: getBool(47),
    lunchSupport: getBool(48),
    languageFamiliarization: getBool(49),
    isNewlyEnrolled: getBool(50),
    enrolledDate: parseDate(row[51]),
    isFullDay: getBool(52),
    isBoardingClass: getBool(53),
    isBoarding: getBool(54),
    motherEthnicity: getStr(56),
    fatherEthnicity: getStr(58),
    knowsSwimming: getBool(59),
    eyeDisease: getBool(60),
    parentHasSmartphone: getBool(61),
    parentHasComputerInternet: getBool(62),
    childDevelopmentNotes: getStr(63),

    hasNoFather: getBool(64),
    fatherName: getStr(65),
    fatherJob: getStr(66),
    fatherBirthYear: getInt(67),
    fatherPhone: getStr(68),
    fatherCccd: getStr(69),

    hasNoMother: getBool(70),
    motherName: getStr(71),
    motherJob: getStr(72),
    motherBirthYear: getInt(73),
    motherPhone: getStr(74),
    motherCccd: getStr(75),

    guardianName: getStr(76),
    guardianJob: getStr(77),
    guardianBirthYear: getInt(78),
    guardianPhone: getStr(79),
    guardianGender: getStr(80),
    guardianCccd: getStr(81),
  };
}

export type ValidatedStudentData = z.infer<typeof csvRowSchema>;

export interface RowValidationResult {
  row: number;
  data: ReturnType<typeof mapRowToSchema>;
  isValid: boolean;
  errors: string[];
}

importRoutes.post(
  "/import",
  requireAuth,
  requireRole("school_admin"),
  async (c: Context) => {
    const schoolId = (c.get("auth").claims as TenantAccessTokenClaims)
      .school_id;

    let body: { file?: File | string; dryRun?: string | boolean };
    try {
      body = await c.req.parseBody();
    } catch {
      return c.json(
        {
          success: false,
          data: null,
          error: { code: "BAD_REQUEST", message: "Form body parse error" },
        },
        400,
      );
    }

    const dryRun = body.dryRun === "true" || body.dryRun === true;
    const file = body.file;

    if (!file) {
      return c.json(
        {
          success: false,
          data: null,
          error: { code: "VALIDATION_ERROR", message: "File CSV is required" },
        },
        400,
      );
    }

    let csvContent = "";
    if (typeof file === "string") {
      csvContent = file;
    } else if (file instanceof File) {
      csvContent = await file.text();
    } else {
      return c.json(
        {
          success: false,
          data: null,
          error: { code: "VALIDATION_ERROR", message: "Invalid file upload" },
        },
        400,
      );
    }

    const parsed = Papa.parse<string[]>(csvContent, {
      skipEmptyLines: "greedy",
    });

    if (!parsed.data || parsed.data.length <= 1) {
      return c.json(
        {
          success: false,
          data: null,
          error: {
            code: "EMPTY_FILE",
            message: "Tập tin rỗng hoặc không có dữ liệu",
          },
        },
        400,
      );
    }

    // Row 0 is header, rows 1.. are data
    const rows = parsed.data.slice(1);
    const results: RowValidationResult[] = [];
    const cccdSet = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i]!;
      // Skip empty lines
      if (rawRow.length === 0 || rawRow.every((val) => !val.trim())) {
        continue;
      }

      const rowNumber = i + 2; // 1-based, skipping header
      const mapped = mapRowToSchema(rawRow);
      const parseRes = csvRowSchema.safeParse(mapped);

      const errors: string[] = [];

      if (!parseRes.success) {
        for (const issue of parseRes.error.issues) {
          errors.push(`${issue.path.join(".")}: ${issue.message}`);
        }
      }

      // CCCD uniqueness within the file
      if (mapped.cccd) {
        if (cccdSet.has(mapped.cccd)) {
          errors.push(
            `cccd: Số CCCD ${mapped.cccd} bị trùng lặp trong file CSV`,
          );
        } else {
          cccdSet.add(mapped.cccd);
        }
      }

      results.push({
        row: rowNumber,
        data: mapped,
        isValid: errors.length === 0,
        errors,
      });
    }

    const total = results.length;
    const valid = results.filter((r) => r.isValid).length;
    const invalid = total - valid;

    if (dryRun) {
      return c.json({
        success: true,
        data: {
          dryRun: true,
          total,
          valid,
          invalid,
          results,
        },
        error: null,
      });
    }

    // If not dryRun, but has invalid rows, we reject the whole batch or return errors
    if (invalid > 0) {
      return c.json(
        {
          success: false,
          data: {
            total,
            valid,
            invalid,
            results: results.filter((r) => !r.isValid),
          },
          error: {
            code: "VALIDATION_ERROR",
            message: `Có ${invalid} dòng không hợp lệ. Vui lòng sửa lỗi trước khi import.`,
          },
        },
        400,
      );
    }

    // Perform actual import in a transaction
    try {
      await withTenant(schoolId, async (tx: TenantTransaction) => {
        // Find or cache active classes for matching
        const activeClasses = await tx
          .select()
          .from(classes)
          .where(
            and(eq(classes.schoolId, schoolId), eq(classes.status, "active")),
          );
        const classMap = new Map<string, typeof classes.$inferSelect>();
        for (const cls of activeClasses) {
          classMap.set(cls.name.toLowerCase(), cls);
        }

        for (const item of results) {
          const d = item.data;

          // Check if student exists by CCCD
          const [existing] = await tx
            .select({ id: students.id })
            .from(students)
            .where(
              and(eq(students.schoolId, schoolId), eq(students.cccd, d.cccd)),
            );

          if (existing) {
            throw new Error(
              `Dòng ${item.row}: Học sinh có CCCD ${d.cccd} đã tồn tại trên hệ thống`,
            );
          }

          let assignedClassId: string | null = null;
          let classRow: typeof classes.$inferSelect | undefined;
          if (d.className) {
            classRow = classMap.get(d.className.toLowerCase());
            if (classRow) {
              assignedClassId = classRow.id;
            }
          }

          const studentId = crypto.randomUUID();
          const address = [
            d.currentAddressDetail,
            d.currentHamlet,
            d.currentCommune,
            d.currentProvince,
          ]
            .filter(Boolean)
            .join(", ");

          await tx.insert(students).values({
            id: studentId,
            schoolId,
            fullName: d.fullName,
            status: "active",
            dob: d.dob,
            gender: d.gender,
            cccd: d.cccd,
            cccdIssueDate: d.cccdIssueDate,
            cccdIssuePlace: d.cccdIssuePlace,
            address: address || null,
            currentClassId: assignedClassId,
          });

          // Insert Student Profile
          await tx.insert(studentProfiles).values({
            studentId,
            schoolId,
            studentCode: d.studentCode,
            statusDate: d.statusDate,
            transferredFromProvince: d.transferredFromProvince,
            transferredFromCommune: d.transferredFromCommune,
            dropoutReason: d.dropoutReason,
            isNewlyEnrolled: d.isNewlyEnrolled,
            enrolledDate: d.enrolledDate,
            isFullDay: d.isFullDay,
            isBoardingClass: d.isBoardingClass,
            isBoarding: d.isBoarding,
            ethnicity: d.ethnicity,
            nationality: d.nationality,
            religion: d.religion,
            birthPlace: d.birthPlace,
            birthPlaceProvince: d.birthPlaceProvince,
            birthPlaceCommune: d.birthPlaceCommune,
            birthCertProvince: d.birthCertProvince,
            birthCertCommune: d.birthCertCommune,
            nativePlaceProvince: d.nativePlaceProvince,
            nativePlaceCommune: d.nativePlaceCommune,
            nativePlaceVillage: d.nativePlaceVillage,
            permanentProvince: d.permanentProvince,
            permanentCommune: d.permanentCommune,
            permanentHamlet: d.permanentHamlet,
            currentAddressDetail: d.currentAddressDetail,
            currentProvince: d.currentProvince,
            currentCommune: d.currentCommune,
            currentHamlet: d.currentHamlet,
            personalId: d.personalId,
            passportNumber: d.passportNumber,
            passportIssuePlace: d.passportIssuePlace,
            passportIssueDate: d.passportIssueDate,
            area: d.area,
            disabilityType: d.disabilityType,
            policyTarget: d.policyTarget,
            tuitionExempt: d.tuitionExempt,
            tuitionReduced: d.tuitionReduced,
            studyCostSupport: d.studyCostSupport,
            lunchSupport: d.lunchSupport,
            languageFamiliarization: d.languageFamiliarization,
            motherEthnicity: d.motherEthnicity,
            fatherEthnicity: d.fatherEthnicity,
            knowsSwimming: d.knowsSwimming,
            eyeDisease: d.eyeDisease,
            parentHasSmartphone: d.parentHasSmartphone,
            parentHasComputerInternet: d.parentHasComputerInternet,
            childDevelopmentNotes: d.childDevelopmentNotes,
          });

          // Enroll to class if class exists
          if (classRow) {
            await tx.insert(classStudents).values({
              id: crypto.randomUUID(),
              schoolId,
              classId: classRow.id,
              studentId,
              schoolYearId: classRow.schoolYearId,
              enrolledAt: new Date(),
            });
          }

          // Responsible persons (Cha & Mẹ)
          const personsToInsert: Array<typeof responsiblePersons.$inferInsert> =
            [];

          if (d.fatherName && !d.hasNoFather) {
            personsToInsert.push({
              id: crypto.randomUUID(),
              studentId,
              type: "father",
              fullName: d.fatherName,
              yearOfBirth: d.fatherBirthYear ?? 1980,
              cccd: d.fatherCccd || "",
              phone: d.fatherPhone || "",
              occupation: d.fatherJob,
            });
          }

          if (d.motherName && !d.hasNoMother) {
            personsToInsert.push({
              id: crypto.randomUUID(),
              studentId,
              type: "mother",
              fullName: d.motherName,
              yearOfBirth: d.motherBirthYear ?? 1985,
              cccd: d.motherCccd || "",
              phone: d.motherPhone || "",
              occupation: d.motherJob,
            });
          }

          if (d.guardianName) {
            personsToInsert.push({
              id: crypto.randomUUID(),
              studentId,
              type: "guardian",
              fullName: d.guardianName,
              yearOfBirth: d.guardianBirthYear ?? 1980,
              cccd: d.guardianCccd || "",
              phone: d.guardianPhone || "",
              occupation: d.guardianJob,
            });
          }

          if (personsToInsert.length > 0) {
            await tx.insert(responsiblePersons).values(personsToInsert);

            // Register parent accounts and link
            for (const person of personsToInsert) {
              if (person.phone && /^0\d{9}$/.test(person.phone)) {
                const parent = await registerParent(
                  {
                    phone: person.phone,
                    schoolId,
                    displayName: person.fullName,
                  },
                  tx,
                );
                await tx.insert(parentChildren).values({
                  id: crypto.randomUUID(),
                  parentId: parent.user.id,
                  childId: studentId,
                });
              }
            }
          }
        }
      });

      return c.json(
        {
          success: true,
          data: {
            total,
            imported: valid,
          },
          error: null,
        },
        201,
      );
    } catch (error: any) {
      return c.json(
        {
          success: false,
          data: null,
          error: {
            code: "IMPORT_FAILED",
            message: error?.message || "Lỗi lưu dữ liệu",
          },
        },
        400,
      );
    }
  },
);

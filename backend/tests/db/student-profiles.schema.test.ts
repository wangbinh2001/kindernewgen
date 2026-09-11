import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { withTenant } from "../../src/db/tenant";
import {
  responsiblePersons,
  schools,
  studentProfiles,
  students,
} from "../../src/db/schema";

function scenario() {
  const id = crypto.randomUUID();
  return {
    schoolA: `profile-school-a-${id}`,
    schoolB: `profile-school-b-${id}`,
    studentA: `profile-student-a-${id}`,
    studentB: `profile-student-b-${id}`,
  };
}

test("student profiles are tenant-scoped one-to-one extensions", async () => {
  const ids = scenario();

  try {
    await db.insert(schools).values([
      { id: ids.schoolA, name: `Profile School A ${ids.schoolA}` },
      { id: ids.schoolB, name: `Profile School B ${ids.schoolB}` },
    ]);
    await withTenant(ids.schoolA, (tx) =>
      tx.insert(students).values({
        id: ids.studentA,
        schoolId: ids.schoolA,
        fullName: "Nguyen Thi A",
      }),
    );
    await withTenant(ids.schoolB, (tx) =>
      tx.insert(students).values({
        id: ids.studentB,
        schoolId: ids.schoolB,
        fullName: "Nguyen Thi B",
      }),
    );

    const [profile] = await withTenant(ids.schoolA, (tx) =>
      tx
        .insert(studentProfiles)
        .values({
          studentId: ids.studentA,
          schoolId: ids.schoolA,
          studentCode: "HS-001",
          statusDate: "2026-07-15",
          transferredFromProvince: "Da Nang",
          transferredFromCommune: "Hai Chau",
          dropoutReason: null,
          isNewlyEnrolled: true,
          enrolledDate: "2026-07-15",
          isFullDay: true,
          isBoardingClass: false,
          isBoarding: false,
          ethnicity: "Kinh",
          nationality: "Viet Nam",
          religion: "None",
          birthPlace: "Da Nang Hospital",
          birthPlaceProvince: "Da Nang",
          birthPlaceCommune: "Hai Chau",
          birthCertProvince: "Da Nang",
          birthCertCommune: "Hai Chau",
          nativePlaceProvince: "Quang Nam",
          nativePlaceCommune: "Duy Xuyen",
          nativePlaceVillage: "Village 1",
          permanentProvince: "Da Nang",
          permanentCommune: "Hai Chau",
          permanentHamlet: "Hamlet 1",
          currentAddressDetail: "1 Test Street",
          currentProvince: "Da Nang",
          currentCommune: "Hai Chau",
          currentHamlet: "Hamlet 2",
          personalId: "079123456789",
          passportNumber: null,
          passportIssuePlace: null,
          passportIssueDate: null,
          area: "urban",
          disabilityType: null,
          policyTarget: null,
          tuitionExempt: false,
          tuitionReduced: false,
          studyCostSupport: false,
          lunchSupport: false,
          languageFamiliarization: true,
          motherEthnicity: "Kinh",
          fatherEthnicity: "Kinh",
          knowsSwimming: false,
          eyeDisease: false,
          parentHasSmartphone: true,
          parentHasComputerInternet: true,
          childDevelopmentNotes: "No note",
        })
        .returning(),
    );

    expect(profile).toMatchObject({
      studentId: ids.studentA,
      schoolId: ids.schoolA,
      studentCode: "HS-001",
      personalId: "079123456789",
    });

    await withTenant(ids.schoolA, async (tx) => {
      await tx.insert(responsiblePersons).values({
        id: `responsible-${ids.studentA}`,
        studentId: ids.studentA,
        type: "mother",
        fullName: "Existing Guardian",
        yearOfBirth: 1990,
        cccd: "079000000001",
        phone: "0900000001",
      });
      const [updated] = await tx
        .update(responsiblePersons)
        .set({ occupation: "Teacher", isEthnic: false })
        .where(eq(responsiblePersons.studentId, ids.studentA))
        .returning();
      expect(updated).toMatchObject({
        occupation: "Teacher",
        isEthnic: false,
      });
    });

    const [visibleInA] = await withTenant(ids.schoolA, (tx) =>
      tx
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.studentId, ids.studentA)),
    );
    expect(visibleInA?.studentId).toBe(ids.studentA);

    const visibleInB = await withTenant(ids.schoolB, (tx) =>
      tx
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.studentId, ids.studentA)),
    );
    expect(visibleInB).toEqual([]);

    await expect(
      withTenant(ids.schoolA, (tx) =>
        tx.insert(studentProfiles).values({
          studentId: ids.studentA,
          schoolId: ids.schoolA,
        }),
      ),
    ).rejects.toThrow();

    await withTenant(ids.schoolA, async (tx) => {
      await tx
        .delete(responsiblePersons)
        .where(eq(responsiblePersons.studentId, ids.studentA));
      await tx.delete(students).where(eq(students.id, ids.studentA));
    });
    const afterStudentDelete = await withTenant(ids.schoolA, (tx) =>
      tx
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.studentId, ids.studentA)),
    );
    expect(afterStudentDelete).toEqual([]);
  } finally {
    await withTenant(ids.schoolA, async (tx) => {
      await tx
        .delete(responsiblePersons)
        .where(eq(responsiblePersons.studentId, ids.studentA));
      await tx.delete(students).where(eq(students.id, ids.studentA));
    });
    await withTenant(ids.schoolB, (tx) =>
      tx.delete(students).where(eq(students.id, ids.studentB)),
    );
    await db.delete(schools).where(eq(schools.id, ids.schoolA));
    await db.delete(schools).where(eq(schools.id, ids.schoolB));
  }
});

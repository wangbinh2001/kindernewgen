# Student Profiles Design

## Goal

Add a tenant-protected one-to-one `student_profiles` table for the administrative fields represented by the supplied preschool CSV, without changing the existing `students` contract.

## Decisions

- Keep existing profile-like columns on `students` unchanged for backward compatibility.
- Use `student_profiles.student_id` as both primary key and `students.id` foreign key with `ON DELETE CASCADE`.
- Store `school_id` on `student_profiles` and enforce tenant isolation with PostgreSQL FORCE RLS and the project's `app.school_id` setting.
- Add nullable `occupation` and `is_ethnic` columns to `responsible_persons`; nullable keeps old inserts valid and distinguishes unknown from false.
- Do not add `school_id` to `responsible_persons` in this scope because that would change the existing table's tenancy model and API behavior beyond the requested extension.
- Generate a new Drizzle migration only; never edit or delete prior migrations.

## Verification

- Add a real PostgreSQL integration test covering profile persistence, one-to-one uniqueness, cascade cleanup, RLS isolation, and backward-compatible responsible-person inserts.
- Run the focused test RED before schema changes, then GREEN after migration.
- Run the full test suite, TypeScript check, and Prettier check before reporting completion.

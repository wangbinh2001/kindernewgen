# Auth and Roles

Roles are `system_admin`, `school_admin`, `teacher`, `staff`, and `parent`.

- `system_admin` operates global system routes and has no tenant by default.
- `school_admin` manages one school context.
- `teacher` and `staff` have limited school capabilities.
- `parent` can read only linked children through `parent_children`.

Password recovery is manual and phone-first because SMS/email is not required for the MVP:

1. The public forgot-password route returns the configured System Admin support phone without account enumeration.
2. A School Admin verifies the requester offline.
3. The School Admin calls `/school/users/:id/reset-password`.
4. The API returns a temporary password once, sets `must_change_password`, and increments `session_version`.
5. The user changes it through `/auth/change-password`.

Reset requests are tenant-scoped and cannot target another school.

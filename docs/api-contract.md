# API Contract

Base URL: `/api/v1`.

Interactive API documentation is available at `/docs`; the machine-readable
OpenAPI 3.0 contract is available at `/openapi.json`.

Successful responses use:

```json
{ "success": true, "data": {}, "error": null }
```

Errors use:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "..." }
}
```

Common codes are `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, and `INTERNAL_ERROR`.

## Authentication

Send `Authorization: Bearer <token>`. Tenant tokens include the verified `school_id`, `membership_id`, `role`, and `session_version`. A request body must never override the school from the token.

Important routes include:

- `/auth/login`
- `/auth/forgot-password`
- `/auth/change-password`
- `/school/users/:id/reset-password`
- `/school/students`
- `/school/attendance`
- `/school/dashboard`
- `/parent/children`

Frontend code should use the returned envelope and must not depend on raw Drizzle column names unless the endpoint contract explicitly exposes them.

## Object storage

Request `POST /api/v1/school/storage/upload-url` with `fileName`, `contentType`,
`size`, and `purpose`. The API returns a tenant-scoped `objectKey` and upload
URL. Upload the exact declared byte size and content type with `PUT`, then use
the content endpoint for authorized reads. Local storage is for development;
production should provide an S3-compatible provider such as MinIO, S3, or R2.

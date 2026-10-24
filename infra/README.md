# infra/

Local and deploy infrastructure.

- `docker-compose.yml` (repo root) — local dev stack: Postgres (ADR-D5) + MinIO S3-compatible storage (ADR-D6).
- Database migrations land here once the data model (Step 1.2) is built (Drizzle Kit, ADR-D5).
- Remote executor / Nextflow deploy config (ADR-D4) lands here in Phase 3.

Nothing here provisions cloud resources yet — the pilot runs against the local compose stack.

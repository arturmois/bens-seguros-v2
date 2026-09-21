-- AlterTable
ALTER TABLE "Example" ALTER COLUMN "organizationId" SET DEFAULT (current_setting('app.tenant_id'::text))::uuid;

-- Row level security (ADR-004): the application role only sees and writes rows of the tenant that
-- `db.withTenant` sets for the transaction. Without a tenant, `current_setting` raises an error.
ALTER TABLE "Example" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Example" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Example"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

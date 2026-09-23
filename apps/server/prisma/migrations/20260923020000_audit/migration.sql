-- AD-008. A read with the tenant unset raises, matching the other tenant tables.
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditLog_id_organizationId_key" ON "AuditLog"("id", "organizationId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (
    CASE
      WHEN NULLIF(current_setting('app.tenant_id', true), '') IS NULL
      THEN (current_setting('app.tenant_id'))::uuid = "organizationId"
      ELSE "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    END
  )
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

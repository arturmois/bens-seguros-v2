-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_id_organizationId_key" ON "Invitation"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organizationId_tokenHash_key" ON "Invitation"("organizationId", "tokenHash");

-- One pending invite per e-mail in the organization. Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "Invitation_pending_email" ON "Invitation"("organizationId", "email") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AD-007. A read with neither setting raises, matching the other tenant tables. WITH CHECK is the tenant only.
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Invitation"
  USING (
    CASE
      WHEN NULLIF(current_setting('app.tenant_id', true), '') IS NULL
       AND NULLIF(current_setting('app.invitation_token', true), '') IS NULL
      THEN (current_setting('app.tenant_id'))::uuid = "organizationId"
      ELSE "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR "tokenHash" = NULLIF(current_setting('app.invitation_token', true), '')
    END
  )
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

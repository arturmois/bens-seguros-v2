-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'COMMERCIAL', 'VIEWER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING');

-- DropTable
DROP TABLE "Example";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "slug" TEXT;
UPDATE "Organization" SET "slug" = "id"::text WHERE "slug" IS NULL;
ALTER TABLE "Organization" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateTable
CREATE TABLE "Member" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "commissionSplitBp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_id_organizationId_key" ON "Member"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_organizationId_userId_key" ON "Member"("organizationId", "userId");

-- One OWNER per organization. Prisma cannot express a partial unique index.
CREATE UNIQUE INDEX "Member_one_owner" ON "Member"("organizationId") WHERE "role" = 'OWNER';

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_id_organizationId_key" ON "Subscription"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AD-006. A read with neither setting raises, matching the tenant tables. WITH CHECK is the tenant only.
ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Member"
  USING (
    CASE
      WHEN NULLIF(current_setting('app.tenant_id', true), '') IS NULL
       AND NULLIF(current_setting('app.user_id', true), '') IS NULL
      THEN (current_setting('app.tenant_id'))::uuid = "organizationId"
      ELSE "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR "userId" = NULLIF(current_setting('app.user_id', true), '')::uuid
    END
  )
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Organization"
  USING (
    CASE
      WHEN NULLIF(current_setting('app.tenant_id', true), '') IS NULL
       AND NULLIF(current_setting('app.user_id', true), '') IS NULL
      THEN (current_setting('app.tenant_id'))::uuid = "id"
      ELSE "id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR EXISTS (
          SELECT 1 FROM "Member" AS m
           WHERE m."organizationId" = "Organization"."id"
             AND m."userId" = NULLIF(current_setting('app.user_id', true), '')::uuid
        )
    END
  )
  WITH CHECK ("id" = (current_setting('app.tenant_id'))::uuid);

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subscription"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

INSERT INTO "Plan" ("id", "code", "name", "maxUsers")
VALUES ('018f0000-0000-7000-8000-0000000000aa', 'trial', 'Trial', 5);

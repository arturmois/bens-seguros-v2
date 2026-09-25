-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "contactId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_id_organizationId_key" ON "ConsentRecord"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_contactId_organizationId_fkey" FOREIGN KEY ("contactId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_conversationId_organizationId_fkey" FOREIGN KEY ("conversationId", "organizationId") REFERENCES "Conversation"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_channelId_organizationId_fkey" FOREIGN KEY ("channelId", "organizationId") REFERENCES "Channel"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Row level security (ADR-004).
ALTER TABLE "ConsentRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConsentRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConsentRecord"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

-- AD-018: the Web Chat link reads its organization by `publicChatKey` (`withPublicChatKey`), the
-- same way an invitation is read by its token hash (AD-007). Writes still need the tenant.
DROP POLICY tenant_isolation ON "Organization";
CREATE POLICY tenant_isolation ON "Organization"
  USING (
    CASE
      WHEN NULLIF(current_setting('app.tenant_id', true), '') IS NULL
       AND NULLIF(current_setting('app.user_id', true), '') IS NULL
       AND NULLIF(current_setting('app.public_chat_key', true), '') IS NULL
      THEN (current_setting('app.tenant_id'))::uuid = "id"
      ELSE "id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
        OR EXISTS (
          SELECT 1 FROM "Member" AS m
           WHERE m."organizationId" = "Organization"."id"
             AND m."userId" = NULLIF(current_setting('app.user_id', true), '')::uuid
        )
        OR "publicChatKey" = NULLIF(current_setting('app.public_chat_key', true), '')
    END
  )
  WITH CHECK ("id" = (current_setting('app.tenant_id'))::uuid);

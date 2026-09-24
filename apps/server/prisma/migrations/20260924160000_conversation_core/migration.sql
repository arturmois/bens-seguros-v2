-- CreateEnum
CREATE TYPE "ChannelKind" AS ENUM ('WEB_CHAT');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ConversationHandler" AS ENUM ('AI', 'QUEUE', 'HUMAN');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('CONTACT', 'AI', 'HUMAN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Channel" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "kind" "ChannelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "phoneE164" TEXT NOT NULL,
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "contactId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "status" "ConversationStatus" NOT NULL,
    "handler" "ConversationHandler" NOT NULL,
    "assigneeId" UUID,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL DEFAULT (current_setting('app.tenant_id'::text))::uuid,
    "conversationId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "authorUserId" UUID,
    "kind" "MessageKind" NOT NULL,
    "text" TEXT,
    "deliveryStatus" "DeliveryStatus",
    "externalId" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Channel_id_organizationId_key" ON "Channel"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_organizationId_key" ON "Contact"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_phoneE164_key" ON "Contact"("organizationId", "phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_id_organizationId_key" ON "Conversation"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_id_channelId_organizationId_key" ON "Conversation"("id", "channelId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_organizationId_key" ON "Message"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_organizationId_conversationId_seq_key" ON "Message"("organizationId", "conversationId", "seq");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_ownerId_fkey" FOREIGN KEY ("organizationId", "ownerId") REFERENCES "Member"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_organizationId_fkey" FOREIGN KEY ("contactId", "organizationId") REFERENCES "Contact"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_organizationId_fkey" FOREIGN KEY ("channelId", "organizationId") REFERENCES "Channel"("id", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_assigneeId_fkey" FOREIGN KEY ("organizationId", "assigneeId") REFERENCES "Member"("organizationId", "userId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_channelId_organizationId_fkey" FOREIGN KEY ("conversationId", "channelId", "organizationId") REFERENCES "Conversation"("id", "channelId", "organizationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------------------------
-- What Prisma cannot express. The `organizationId` defaults above read the transaction tenant.
-- ---------------------------------------------------------------------------------------------

-- Door 1: exactly one Web Chat per organization.
CREATE UNIQUE INDEX "Channel_one_web_chat" ON "Channel"("organizationId") WHERE "kind" = 'WEB_CHAT';

-- Door 2: the phone is stored in E.164 only (normalized at the edge, `shared/phone.ts`).
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_phoneE164_check"
  CHECK ("phoneE164" ~ '^\+[1-9][0-9]{7,14}$');

-- Door 3 (ADR-013): one conversation per contact and channel that is not closed; the assignee
-- exists exactly while a human handles it; `closedAt` exactly while it is closed.
CREATE UNIQUE INDEX "Conversation_one_open" ON "Conversation"("organizationId", "contactId", "channelId")
  WHERE "status" <> 'CLOSED';
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignee_check"
  CHECK (("handler" = 'HUMAN') = ("assigneeId" IS NOT NULL));
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_closed_check"
  CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL));

-- Door 4 (ADR-013): the inbound of a channel is idempotent by `externalId` (`ON CONFLICT DO
-- NOTHING` on this index), and a message is consistent with its direction, author and kind.
CREATE UNIQUE INDEX "Message_channel_externalId" ON "Message"("organizationId", "channelId", "externalId")
  WHERE "externalId" IS NOT NULL;
ALTER TABLE "Message" ADD CONSTRAINT "Message_direction_check"
  CHECK (("direction" = 'INBOUND') = ("author" = 'CONTACT'));
ALTER TABLE "Message" ADD CONSTRAINT "Message_delivery_check"
  CHECK (("direction" = 'INBOUND') = ("deliveryStatus" IS NULL));
ALTER TABLE "Message" ADD CONSTRAINT "Message_author_user_check"
  CHECK (("author" = 'HUMAN') = ("authorUserId" IS NOT NULL));
ALTER TABLE "Message" ADD CONSTRAINT "Message_text_check"
  CHECK (("kind" = 'TEXT') = ("text" IS NOT NULL));

-- Row level security (ADR-004).
ALTER TABLE "Channel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Channel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Channel"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Contact"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

ALTER TABLE "Conversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Conversation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Conversation"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Message"
  USING ("organizationId" = (current_setting('app.tenant_id'))::uuid)
  WITH CHECK ("organizationId" = (current_setting('app.tenant_id'))::uuid);

-- Door 7: the Web Chat of every organization that already exists. One statement, so it is atomic.
-- The owner runs migrations, and FORCE makes row security apply to it unless it is a superuser:
-- `Organization` stops forcing it only while its ids are read, and each insert goes through the
-- `Channel` policy with the tenant of its organization, like the application would.
DO $$
DECLARE
  organization record;
BEGIN
  ALTER TABLE "Organization" NO FORCE ROW LEVEL SECURITY;
  FOR organization IN SELECT "id" FROM "Organization" LOOP
    PERFORM set_config('app.tenant_id', organization."id"::text, true);
    INSERT INTO "Channel" ("id", "kind", "name", "updatedAt")
    VALUES (uuidv7(), 'WEB_CHAT', 'Web Chat', now())
    ON CONFLICT ("organizationId") WHERE "kind" = 'WEB_CHAT' DO NOTHING;
  END LOOP;
  ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
  PERFORM set_config('app.tenant_id', '', true);
END
$$;

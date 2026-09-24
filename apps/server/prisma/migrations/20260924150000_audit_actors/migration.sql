-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'AI', 'SYSTEM');

-- AlterTable. Every row written so far has a user actor: the default backfills them, and dropping it
-- makes every new row name its actor explicitly.
ALTER TABLE "AuditLog" ADD COLUMN     "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
ALTER COLUMN "actorUserId" DROP NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "actorType" DROP DEFAULT;

-- ---------------------------------------------------------------------------------------------
-- What Prisma cannot express.
-- ---------------------------------------------------------------------------------------------

-- AD-013: a user actor carries the user; the AI and the system never do.
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_check"
  CHECK (("actorType" = 'USER') = ("actorUserId" IS NOT NULL));

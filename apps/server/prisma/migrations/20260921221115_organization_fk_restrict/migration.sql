-- DropForeignKey
ALTER TABLE "Example" DROP CONSTRAINT "Example_organizationId_fkey";

-- AddForeignKey
ALTER TABLE "Example" ADD CONSTRAINT "Example_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

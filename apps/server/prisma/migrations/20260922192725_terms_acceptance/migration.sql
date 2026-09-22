-- CreateEnum
CREATE TYPE "LegalDocument" AS ENUM ('TERMS', 'PRIVACY');

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "document" "LegalDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TermsAcceptance_userId_document_version_key" ON "TermsAcceptance"("userId", "document", "version");

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

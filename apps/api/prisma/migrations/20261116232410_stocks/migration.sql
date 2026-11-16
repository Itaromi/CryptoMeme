-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('LISTED', 'TAKEOVER', 'ACQUIRED', 'BANKRUPT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'DIVIDEND';
ALTER TYPE "LedgerKind" ADD VALUE 'SPLIT';
ALTER TYPE "LedgerKind" ADD VALUE 'TAKEOVER';
ALTER TYPE "LedgerKind" ADD VALUE 'BANKRUPTCY';

-- CreateTable
CREATE TABLE "Company" (
    "assetId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "ceo" TEXT NOT NULL,
    "eps" DOUBLE PRECISION NOT NULL,
    "growth" DOUBLE PRECISION NOT NULL,
    "epsVol" DOUBLE PRECISION NOT NULL,
    "pe" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION NOT NULL,
    "health" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "quarter" INTEGER NOT NULL DEFAULT 0,
    "nextEarningsAt" TIMESTAMP(3) NOT NULL,
    "consensus" DOUBLE PRECISION NOT NULL,
    "ipoPrice" DECIMAL(38,18) NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'LISTED',
    "statusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "offerPrice" DECIMAL(38,18),
    "offerBy" TEXT,
    "offerEndsAt" TIMESTAMP(3),
    "preOfferLogFair" DOUBLE PRECISION,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "EarningsReport" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quarter" INTEGER NOT NULL,
    "consensus" DOUBLE PRECISION NOT NULL,
    "actual" DOUBLE PRECISION NOT NULL,
    "surprise" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "reaction" DOUBLE PRECISION NOT NULL,
    "dividend" DOUBLE PRECISION NOT NULL,
    "priceBefore" DECIMAL(38,18) NOT NULL,
    "headline" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarningsReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "perShare" DECIMAL(38,8) NOT NULL,
    "recordAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "total" DECIMAL(24,2) NOT NULL DEFAULT 0,
    "holders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EarningsReport_assetId_createdAt_idx" ON "EarningsReport"("assetId", "createdAt");

-- CreateIndex
CREATE INDEX "EarningsReport_createdAt_idx" ON "EarningsReport"("createdAt");

-- CreateIndex
CREATE INDEX "Dividend_paidAt_recordAt_idx" ON "Dividend"("paidAt", "recordAt");

-- CreateIndex
CREATE INDEX "Dividend_assetId_createdAt_idx" ON "Dividend"("assetId", "createdAt");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningsReport" ADD CONSTRAINT "EarningsReport_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Company"("assetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Company"("assetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "CreationKind" AS ENUM ('CRYPTO', 'COMPANY', 'POOL');

-- CreateEnum
CREATE TYPE "CreationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'CREATION';
ALTER TYPE "LedgerKind" ADD VALUE 'CREATION_REFUND';
ALTER TYPE "LedgerKind" ADD VALUE 'VESTING';
ALTER TYPE "LedgerKind" ADD VALUE 'ROYALTY';
ALTER TYPE "LedgerKind" ADD VALUE 'POOL_FEE';

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "royaltiesPaid" DECIMAL(24,2) NOT NULL DEFAULT 0,
ADD COLUMN     "royaltyAccrued" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "royaltyShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "vestDone" DECIMAL(38,8) NOT NULL DEFAULT 0,
ADD COLUMN     "vestEnd" TIMESTAMP(3),
ADD COLUMN     "vestStart" TIMESTAMP(3),
ADD COLUMN     "vestTotal" DECIMAL(38,8) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MiningPool" ADD COLUMN     "earned" DECIMAL(38,8) NOT NULL DEFAULT 0,
ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "Creation" (
    "id" TEXT NOT NULL,
    "kind" "CreationKind" NOT NULL,
    "status" "CreationStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "emoji" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "fee" DECIMAL(24,2) NOT NULL,
    "deposit" DECIMAL(24,2) NOT NULL,
    "assetId" TEXT,
    "poolId" TEXT,
    "reviewNote" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Creation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Creation_assetId_key" ON "Creation"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Creation_poolId_key" ON "Creation"("poolId");

-- CreateIndex
CREATE INDEX "Creation_status_createdAt_idx" ON "Creation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Creation_userId_idx" ON "Creation"("userId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningPool" ADD CONSTRAINT "MiningPool_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creation" ADD CONSTRAINT "Creation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creation" ADD CONSTRAINT "Creation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creation" ADD CONSTRAINT "Creation_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "MiningPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

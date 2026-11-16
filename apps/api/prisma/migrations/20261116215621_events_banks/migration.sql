-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventMood" AS ENUM ('POSITIVE', 'NEGATIVE', 'MARKET');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'BANK_FEE';
ALTER TYPE "LedgerKind" ADD VALUE 'BANK_INTEREST';
ALTER TYPE "LedgerKind" ADD VALUE 'BANK_SWITCH';
ALTER TYPE "LedgerKind" ADD VALUE 'INSURANCE';
ALTER TYPE "LedgerKind" ADD VALUE 'TAX';
ALTER TYPE "LedgerKind" ADD VALUE 'EVENT';

-- AlterTable
ALTER TABLE "Bank" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#94a3b8',
ADD COLUMN     "depositGuarantee" DECIMAL(24,2),
ADD COLUMN     "elecDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "failRiskPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "hackShield" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "insuranceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "interestMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "minNetWorth" DECIMAL(24,2) NOT NULL DEFAULT 0,
ADD COLUMN     "openingFee" DECIMAL(24,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxShield" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "bankAccrued" DECIMAL(24,8) NOT NULL DEFAULT 0,
ADD COLUMN     "bankSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "EventType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mood" "EventMood" NOT NULL,
    "ratePerDay" DOUBLE PRECISION NOT NULL,
    "cooldownHours" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "noticeMinutes" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "params" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EventType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "announcedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "triggeredBy" TEXT,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "amount" DECIMAL(24,2),
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventType_slug_key" ON "EventType"("slug");

-- CreateIndex
CREATE INDEX "GameEvent_status_startsAt_idx" ON "GameEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "EventType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

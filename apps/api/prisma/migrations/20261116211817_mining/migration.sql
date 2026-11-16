-- CreateEnum
CREATE TYPE "ComponentKind" AS ENUM ('CPU', 'GPU', 'ASIC', 'PSU', 'MOTHERBOARD', 'COOLING', 'RACK');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('OK', 'BROKEN', 'DESTROYED');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('PPS', 'PPLNS', 'SOLO', 'SHADY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'MINING_REWARD';
ALTER TYPE "LedgerKind" ADD VALUE 'ELECTRICITY';
ALTER TYPE "LedgerKind" ADD VALUE 'HARDWARE_BUY';
ALTER TYPE "LedgerKind" ADD VALUE 'HARDWARE_SELL';
ALTER TYPE "LedgerKind" ADD VALUE 'REPAIR';

-- AlterTable
ALTER TABLE "Wallet" ADD COLUMN     "hardwareValue" DECIMAL(24,2) NOT NULL DEFAULT 0,
ADD COLUMN     "powerCut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComponentModel" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "ComponentKind" NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "price" DECIMAL(24,2) NOT NULL,
    "watts" INTEGER NOT NULL,
    "hashrates" JSONB NOT NULL DEFAULT '{}',
    "efficiency" DOUBLE PRECISION,
    "socket" TEXT,
    "gpuSlots" INTEGER,
    "coolingW" INTEGER,
    "rackSlots" INTEGER,
    "airflow" DOUBLE PRECISION,
    "failureRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0005,
    "description" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComponentModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentItem" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "wear" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ItemStatus" NOT NULL DEFAULT 'OK',
    "purchasePrice" DECIMAL(24,2) NOT NULL,
    "rigId" TEXT,
    "facilityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComponentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(24,2) NOT NULL,
    "elecPrice" DOUBLE PRECISION NOT NULL,
    "maxPowerKw" DOUBLE PRECISION NOT NULL,
    "rackSlots" INTEGER NOT NULL,
    "ambientTemp" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "FacilityType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rig" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "poolId" TEXT,
    "overclock" INTEGER NOT NULL DEFAULT 0,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hashrate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastMinedAt" TIMESTAMP(3),
    "minedTotal" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningNetwork" (
    "assetId" TEXT NOT NULL,
    "algo" TEXT NOT NULL,
    "blockReward" DECIMAL(38,8) NOT NULL,
    "npcHashrate" DOUBLE PRECISION NOT NULL,
    "baseNpcHashrate" DOUBLE PRECISION NOT NULL,
    "initialPrice" DOUBLE PRECISION NOT NULL,
    "halvingEveryDays" DOUBLE PRECISION NOT NULL DEFAULT 14,
    "lastHalvingAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalMined" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "playerHashrate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MiningNetwork_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "MiningPool" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "PoolType" NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "federation" TEXT,
    "scamRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MiningPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolBalance" (
    "walletId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "pending" DECIMAL(38,8) NOT NULL DEFAULT 0,
    "lastPaidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolBalance_pkey" PRIMARY KEY ("walletId","poolId")
);

-- CreateTable
CREATE TABLE "MiningLog" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComponentModel_slug_key" ON "ComponentModel"("slug");

-- CreateIndex
CREATE INDEX "ComponentModel_kind_price_idx" ON "ComponentModel"("kind", "price");

-- CreateIndex
CREATE INDEX "ComponentItem_walletId_status_idx" ON "ComponentItem"("walletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityType_slug_key" ON "FacilityType"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MiningPool_slug_key" ON "MiningPool"("slug");

-- CreateIndex
CREATE INDEX "MiningLog_walletId_createdAt_idx" ON "MiningLog"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "ComponentItem" ADD CONSTRAINT "ComponentItem_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentItem" ADD CONSTRAINT "ComponentItem_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ComponentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentItem" ADD CONSTRAINT "ComponentItem_rigId_fkey" FOREIGN KEY ("rigId") REFERENCES "Rig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentItem" ADD CONSTRAINT "ComponentItem_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "FacilityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rig" ADD CONSTRAINT "Rig_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rig" ADD CONSTRAINT "Rig_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "ComponentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rig" ADD CONSTRAINT "Rig_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "MiningPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningNetwork" ADD CONSTRAINT "MiningNetwork_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningPool" ADD CONSTRAINT "MiningPool_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBalance" ADD CONSTRAINT "PoolBalance_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolBalance" ADD CONSTRAINT "PoolBalance_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "MiningPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningLog" ADD CONSTRAINT "MiningLog_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

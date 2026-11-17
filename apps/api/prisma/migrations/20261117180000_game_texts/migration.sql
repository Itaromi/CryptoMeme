-- Textes traduisibles : clé + paramètres à côté du texte français (qui reste le repli des lignes existantes)

-- AlterTable
ALTER TABLE "MarketEvent" ADD COLUMN     "textKey" TEXT,
ADD COLUMN     "textParams" JSONB;

-- AlterTable
ALTER TABLE "MiningLog" ADD COLUMN     "textKey" TEXT,
ADD COLUMN     "textParams" JSONB;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "textKey" TEXT,
ADD COLUMN     "textParams" JSONB;

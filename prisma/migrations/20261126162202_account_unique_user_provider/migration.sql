-- DropIndex
DROP INDEX "Account_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_provider_key" ON "Account"("userId", "provider");

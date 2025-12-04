-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" BOOLEAN DEFAULT false,
ALTER COLUMN "password" DROP NOT NULL;

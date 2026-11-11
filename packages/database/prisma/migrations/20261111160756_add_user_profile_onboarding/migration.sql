-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);

-- Domain Integrity Check Constraint
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_speakingSpeed_check" CHECK ("speakingSpeed" IN ('SLOW', 'NORMAL', 'FAST'));

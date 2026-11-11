import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import type { OnboardingInput, UpdateProfileInput } from "@english-sathi/validation";
import type { UserProfileDTO } from "@english-sathi/shared-types";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Profile Read ─────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfileDTO> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException("User profile not found");
    }
    return this.toDTO(profile);
  }

  // ─── Profile Update ───────────────────────────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileInput): Promise<UserProfileDTO> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("User profile not found");
    }

    const updated = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.nativeLanguage !== undefined ? { nativeLanguage: dto.nativeLanguage } : {}),
        ...(dto.explanationLanguage !== undefined ? { explanationLanguage: dto.explanationLanguage } : {}),
        ...(dto.proficiencyLevel !== undefined ? { proficiencyLevel: dto.proficiencyLevel as never } : {}),
        ...(dto.learningGoals !== undefined ? { learningGoals: { set: dto.learningGoals as never } } : {}),
        ...(dto.dailyGoalMinutes !== undefined ? { dailyGoalMinutes: dto.dailyGoalMinutes } : {}),
        ...(dto.speakingSpeed !== undefined ? { speakingSpeed: dto.speakingSpeed } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      },
    });

    return this.toDTO(updated);
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────

  async completeOnboarding(userId: string, dto: OnboardingInput): Promise<UserProfileDTO> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("User profile not found");
    }

    if (profile.onboardingCompletedAt !== null) {
      // Idempotent: re-applying onboarding is allowed (updates preferences)
    }

    const updated = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        displayName: dto.displayName,
        nativeLanguage: dto.nativeLanguage,
        explanationLanguage: dto.explanationLanguage,
        proficiencyLevel: dto.proficiencyLevel as never,
        learningGoals: { set: dto.learningGoals as never },
        dailyGoalMinutes: dto.dailyGoalMinutes,
        speakingSpeed: dto.speakingSpeed,
        timezone: dto.timezone,
        onboardingCompletedAt: new Date(),
      },
    });

    return this.toDTO(updated);
  }

  // ─── Account Deletion (self-service) ─────────────────────────────────────

  async deleteAccount(userId: string, requestingUserId: string): Promise<void> {
    if (userId !== requestingUserId) {
      throw new ForbiddenException("You can only delete your own account");
    }
    // Cascades: UserProfile, VoiceSession, Subscription, etc. via Prisma schema onDelete: Cascade
    await this.prisma.user.delete({ where: { id: userId } });
  }

  // ─── Mapper ───────────────────────────────────────────────────────────────

  private toDTO(profile: {
    id: string;
    userId: string;
    displayName: string;
    nativeLanguage: string;
    targetLanguage: string;
    explanationLanguage: string;
    proficiencyLevel: string;
    dailyGoalMinutes: number;
    speakingSpeed: string;
    learningGoals: string[];
    timezone: string;
    onboardingCompletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserProfileDTO {
    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      nativeLanguage: profile.nativeLanguage,
      targetLanguage: profile.targetLanguage,
      explanationLanguage: profile.explanationLanguage,
      proficiencyLevel: profile.proficiencyLevel as UserProfileDTO["proficiencyLevel"],
      dailyGoalMinutes: profile.dailyGoalMinutes,
      speakingSpeed: profile.speakingSpeed as UserProfileDTO["speakingSpeed"],
      learningGoals: profile.learningGoals as UserProfileDTO["learningGoals"],
      timezone: profile.timezone,
      onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }
}


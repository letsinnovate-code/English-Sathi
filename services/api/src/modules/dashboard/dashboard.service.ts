import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { AuthService } from "../auth/auth.service";
import type { DashboardSummaryDTO, StarterLessonSummaryDTO, SubscriptionSummaryDTO } from "@english-sathi/shared-types";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getDashboard(userId: string): Promise<DashboardSummaryDTO> {
    // Load user, profile, subscription, and usage in parallel
    const [userResult, subscription, usageToday] = await Promise.all([
      this.authService.getMe(userId),
      this.prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      }),
      this.getUsedVoiceSecondsToday(userId),
    ]);

    const { user, profile, onboardingRequired } = userResult;

    // Daily goal progress: sum of voice session durations today
    const completedMinutesToday = Math.floor(usageToday / 60);
    const targetMinutes = profile.dailyGoalMinutes;
    const progressPercent = Math.min(
      100,
      Math.round((completedMinutesToday / targetMinutes) * 100),
    );

    // Subscription summary
    let subscriptionSummary: SubscriptionSummaryDTO | null = null;
    if (subscription) {
      const remaining = Math.max(
        0,
        subscription.plan.dailyVoiceLimitSeconds - usageToday,
      );
      subscriptionSummary = {
        planName: subscription.plan.name,
        status: subscription.status as SubscriptionSummaryDTO["status"],
        dailyVoiceLimitSeconds: subscription.plan.dailyVoiceLimitSeconds,
        usedVoiceSecondsToday: usageToday,
        remainingVoiceSecondsToday: remaining,
      };
    }

    // Level-matched starter lessons (top 3 published at user's proficiency or one below)
    const recommendedLessons = await this.getRecommendedLessons(
      profile.proficiencyLevel as string,
    );

    return {
      user,
      profile,
      onboardingRequired,
      dailyGoal: {
        targetMinutes,
        completedMinutesToday,
        progressPercent,
      },
      subscription: subscriptionSummary,
      recommendedLessons,
    };
  }

  private async getUsedVoiceSecondsToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const result = await this.prisma.voiceSession.aggregate({
      where: {
        userId,
        status: "COMPLETED",
        endedAt: { gte: startOfDay },
      },
      _sum: { durationSeconds: true },
    });

    return result._sum.durationSeconds ?? 0;
  }

  private async getRecommendedLessons(
    proficiencyLevel: string,
  ): Promise<StarterLessonSummaryDTO[]> {
    // Fallback order if level is UNKNOWN: show A1 lessons
    const targetLevel = proficiencyLevel === "UNKNOWN" ? "A1" : proficiencyLevel;

    const lessons = await this.prisma.lesson.findMany({
      where: {
        isPublished: true,
        level: targetLevel as never,
      },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        level: true,
        category: true,
      },
    });

    return lessons.map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      description: l.description,
      level: l.level as StarterLessonSummaryDTO["level"],
      category: l.category,
    }));
  }
}


import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { RedisService } from "../../infrastructure/redis/redis.service";
import type { VoiceQuotaSummaryDTO } from "@english-sathi/shared-types";

const ACTIVE_SESSION_PREFIX = "voice:active-session:";
const HEARTBEAT_PREFIX = "voice:heartbeat:";
const TURN_LOCK_PREFIX = "voice:turn-lock:";

const DEFAULT_FREE_LIMIT_SECONDS = 600; // 10 min/day fallback
const STALE_SESSION_MS = 5 * 60 * 1000; // 5 min without heartbeat -> auto-fail unstarted/orphaned session
const HEARTBEAT_TTL_SECONDS = 120;
const TURN_LOCK_TTL_SECONDS = 30;
const OPEN_SESSION_STATUSES = ["CREATED", "CONNECTING", "ACTIVE", "INTERRUPTED"] as const;

const DELETE_IF_MATCH_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

const REFRESH_HEARTBEAT_LUA = `
local cur = redis.call("get", KEYS[1])
if cur == ARGV[1] or (not cur and ARGV[4] == "1") then
  redis.call("set", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
  redis.call("set", KEYS[2], "1", "EX", tonumber(ARGV[3]))
  return 1
end
return 0
`;

@Injectable()
export class VoiceQuotaService {
  private readonly logger = new Logger(VoiceQuotaService.name);
  private readonly redis: ReturnType<RedisService["getClient"]>;

  constructor(
    private readonly prisma: PrismaService,
    redisService: RedisService,
  ) {
    this.redis = redisService.getClient();
  }

  /**
   * Resolves the user's daily voice allowance (in seconds) from an active
   * subscription, falling back to the FREE plan if none is active.
   */
  async getDailyLimitSeconds(userId: string): Promise<number> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    const now = new Date();
    const isEntitled =
      subscription &&
      (subscription.status === "ACTIVE" || subscription.status === "TRIALING") &&
      (subscription.endsAt === null || subscription.endsAt > now);

    if (isEntitled) {
      return subscription.plan.dailyVoiceLimitSeconds;
    }

    const freePlan = await this.prisma.plan.findUnique({
      where: { name: "FREE" },
      select: { dailyVoiceLimitSeconds: true },
    });

    return freePlan?.dailyVoiceLimitSeconds ?? DEFAULT_FREE_LIMIT_SECONDS;
  }

  /**
   * Sums completed voice session seconds recorded today.
   */
  async getCompletedUsedSecondsToday(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const agg = await this.prisma.voiceSession.aggregate({
      where: {
        userId,
        status: "COMPLETED",
        endedAt: { gte: startOfDay },
      },
      _sum: { durationSeconds: true },
    });

    return agg._sum.durationSeconds ?? 0;
  }

  /**
   * Computes current server-side quota including live elapsed time for an open session.
   */
  async getQuotaSummary(
    userId: string,
    activeSessionStartedAt?: Date | null,
  ): Promise<VoiceQuotaSummaryDTO> {
    const [dailyLimitSeconds, completedToday] = await Promise.all([
      this.getDailyLimitSeconds(userId),
      this.getCompletedUsedSecondsToday(userId),
    ]);

    const sessionSeconds = activeSessionStartedAt
      ? Math.max(0, Math.floor((Date.now() - activeSessionStartedAt.getTime()) / 1000))
      : 0;

    const usedSecondsToday = completedToday + sessionSeconds;
    const remainingSecondsToday = Math.max(0, dailyLimitSeconds - usedSecondsToday);

    return {
      dailyLimitSeconds,
      usedSecondsToday,
      remainingSecondsToday,
      sessionSeconds,
    };
  }

  /**
   * Enforces server-side daily quota and single-concurrent-session rules.
   */
  async assertCanStartSession(userId: string): Promise<VoiceQuotaSummaryDTO> {
    const quota = await this.getQuotaSummary(userId);
    if (quota.remainingSecondsToday <= 0) {
      throw new ForbiddenException(
        "Daily voice practice limit reached. Upgrade your plan or come back tomorrow.",
      );
    }

    // Reap stale abandoned sessions (never connected or silent >5 min with no Redis heartbeat)
    await this.reapStaleSessions(userId);

    const existingOpen = await this.prisma.voiceSession.findFirst({
      where: {
        userId,
        status: { in: [...OPEN_SESSION_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (existingOpen) {
      this.throwConcurrentConflict(existingOpen.id);
    }

    // Reconcile Redis against DB so an orphaned/resurrected lock never blocks new sessions
    const conflictingLockSessionId = await this.reconcileSessionLock(userId);
    if (conflictingLockSessionId) {
      this.throwConcurrentConflict(conflictingLockSessionId);
    }

    return quota;
  }

  throwConcurrentConflict(activeSessionId: string): never {
    throw new ConflictException({
      message: "You already have an active voice session in progress.",
      details: {
        code: "CONCURRENT_SESSION",
        activeSessionId,
      },
    });
  }

  async getActiveOpenLockSessionId(userId: string): Promise<string | null> {
    return this.reconcileSessionLock(userId);
  }

  async acquireSessionLock(
    userId: string,
    sessionId: string,
    remainingSeconds: number,
  ): Promise<boolean> {
    const ttl = Math.max(120, Math.min(7200, remainingSeconds + 60));
    const lockKey = `${ACTIVE_SESSION_PREFIX}${userId}`;
    let result = await this.redis.set(lockKey, sessionId, "EX", ttl, "NX");

    if (result !== "OK") {
      // If the existing Redis lock points to a COMPLETED/FAILED/missing session, clear it and retry once
      const conflictingSessionId = await this.reconcileSessionLock(userId, sessionId);
      if (!conflictingSessionId) {
        result = await this.redis.set(lockKey, sessionId, "EX", ttl, "NX");
      }
    }

    if (result !== "OK") {
      return false;
    }

    await this.redis.set(`${HEARTBEAT_PREFIX}${sessionId}`, "1", "EX", HEARTBEAT_TTL_SECONDS);
    return true;
  }

  async refreshHeartbeat(
    userId: string,
    sessionId: string,
    remainingSeconds: number,
    options?: { allowReacquire?: boolean },
  ): Promise<boolean> {
    if (!(await this.isSessionOpenInDb(sessionId))) {
      await this.releaseSessionLock(userId, sessionId);
      return false;
    }

    const lockTtl = Math.max(120, Math.min(7200, remainingSeconds + 60));
    const lockKey = `${ACTIVE_SESSION_PREFIX}${userId}`;
    const heartbeatKey = `${HEARTBEAT_PREFIX}${sessionId}`;
    const allowReacquireFlag = options?.allowReacquire ? "1" : "0";

    const refreshed = Number(
      await this.redis.eval(
        REFRESH_HEARTBEAT_LUA,
        2,
        lockKey,
        heartbeatKey,
        sessionId,
        String(lockTtl),
        String(HEARTBEAT_TTL_SECONDS),
        allowReacquireFlag,
      ),
    );

    if (refreshed !== 1) {
      return false;
    }

    // Double-check DB after writing so an endSession commit interleaved before Lua never leaves a resurrected lock
    if (!(await this.isSessionOpenInDb(sessionId))) {
      await this.releaseSessionLock(userId, sessionId);
      return false;
    }

    return true;
  }

  async releaseSessionLock(userId: string, sessionId: string): Promise<void> {
    const lockKey = `${ACTIVE_SESSION_PREFIX}${userId}`;
    await Promise.all([
      this.deleteLockIfMatch(lockKey, sessionId),
      this.redis.del(`${HEARTBEAT_PREFIX}${sessionId}`),
    ]);
  }

  /**
   * Serializes turns within a single session so message sequence numbers never collide.
   */
  async withTurnLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = `${TURN_LOCK_PREFIX}${sessionId}`;
    const token = randomUUID();
    const acquired = await this.redis.set(key, token, "EX", TURN_LOCK_TTL_SECONDS, "NX");

    if (acquired !== "OK") {
      throw new ConflictException("A turn is already being processed for this session.");
    }

    try {
      return await fn();
    } finally {
      await this.deleteLockIfMatch(key, token);
    }
  }

  private async isSessionOpenInDb(sessionId: string): Promise<boolean> {
    const row = await this.prisma.voiceSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    return Boolean(
      row && OPEN_SESSION_STATUSES.includes(row.status as (typeof OPEN_SESSION_STATUSES)[number]),
    );
  }

  private async reconcileSessionLock(
    userId: string,
    ignoreSessionId?: string,
  ): Promise<string | null> {
    const lockKey = `${ACTIVE_SESSION_PREFIX}${userId}`;
    const lockedSessionId = await this.redis.get(lockKey);
    if (!lockedSessionId || lockedSessionId === ignoreSessionId) {
      return null;
    }

    const lockedSession = await this.prisma.voiceSession.findUnique({
      where: { id: lockedSessionId },
      select: { id: true, status: true },
    });

    const isOpen = Boolean(
      lockedSession &&
        OPEN_SESSION_STATUSES.includes(
          lockedSession.status as (typeof OPEN_SESSION_STATUSES)[number],
        ),
    );

    if (isOpen && lockedSession) {
      return lockedSession.id;
    }

    await this.deleteLockIfMatch(lockKey, lockedSessionId);
    await this.redis.del(`${HEARTBEAT_PREFIX}${lockedSessionId}`);
    this.logger.warn(
      `Cleared orphaned Redis voice lock for user ${userId} (ended/missing session ${lockedSessionId})`,
    );
    return null;
  }

  private async deleteLockIfMatch(key: string, expectedValue: string): Promise<void> {
    await this.redis.eval(DELETE_IF_MATCH_LUA, 1, key, expectedValue);
  }

  private async reapStaleSessions(userId: string): Promise<void> {
    const openSessions = await this.prisma.voiceSession.findMany({
      where: {
        userId,
        status: { in: ["CREATED", "CONNECTING", "ACTIVE", "INTERRUPTED"] },
      },
      select: { id: true, status: true, startedAt: true, updatedAt: true },
    });

    const cutoff = Date.now() - STALE_SESSION_MS;

    for (const s of openSessions) {
      const hasHeartbeat = await this.redis.get(`${HEARTBEAT_PREFIX}${s.id}`);
      const isStale = !hasHeartbeat && s.updatedAt.getTime() < cutoff;
      if (!isStale) continue;

      // Never connected sessions become FAILED with 0 usage; connected ones COMPLETE with capped elapsed
      const now = new Date();
      if (!s.startedAt) {
        await this.prisma.voiceSession.update({
          where: { id: s.id },
          data: { status: "FAILED", endedAt: now, durationSeconds: 0 },
        });
      } else {
        const elapsed = Math.max(
          1,
          Math.floor((s.updatedAt.getTime() - s.startedAt.getTime()) / 1000),
        );
        await this.prisma.$transaction([
          this.prisma.voiceSession.update({
            where: { id: s.id },
            data: { status: "COMPLETED", endedAt: now, durationSeconds: elapsed },
          }),
          this.prisma.usageRecord.create({
            data: {
              userId,
              sessionId: s.id,
              usageType: "voice_session",
              quantity: elapsed,
              unit: "seconds",
              provider: "auto-reaped",
            },
          }),
        ]);
      }

      await this.releaseSessionLock(userId, s.id);
      this.logger.log(`Reaped stale voice session ${s.id} (prior status=${s.status})`);
    }
  }
}


import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../infrastructure/redis/redis.service";

const REFRESH_TOKEN_PREFIX = "rt:";
const RATE_LIMIT_PREFIX = "rl:auth:";

@Injectable()
export class TokenStoreService {
  private readonly logger = new Logger(TokenStoreService.name);
  private readonly redis: ReturnType<RedisService["getClient"]>;

  constructor(redisService: RedisService) {
    this.redis = redisService.getClient();
  }

  /**
   * Store a refresh token JTI in Redis with TTL (seconds).
   * Key pattern: rt:<userId>:<jti>
   */
  async storeRefreshToken(userId: string, jti: string, ttlSeconds: number): Promise<void> {
    const key = `${REFRESH_TOKEN_PREFIX}${userId}:${jti}`;
    await this.redis.set(key, "1", "EX", ttlSeconds);
  }

  /**
   * Verify that the refresh token JTI exists (not rotated/revoked).
   */
  async isRefreshTokenValid(userId: string, jti: string): Promise<boolean> {
    const key = `${REFRESH_TOKEN_PREFIX}${userId}:${jti}`;
    const val = await this.redis.get(key);
    return val === "1";
  }

  /**
   * Revoke a specific refresh token (rotation after use, or logout).
   */
  async revokeRefreshToken(userId: string, jti: string): Promise<void> {
    const key = `${REFRESH_TOKEN_PREFIX}${userId}:${jti}`;
    await this.redis.del(key);
  }

  /**
   * Revoke ALL refresh tokens for a user (logout from all sessions).
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    const pattern = `${REFRESH_TOKEN_PREFIX}${userId}:*`;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== "0");
  }

  /**
   * Rate limit auth endpoints: max `limit` attempts per `windowSeconds`.
   * Returns remaining attempts (or throws nothing — caller decides response).
   */
  async consumeAuthAttempt(identifier: string, limit: number, windowSeconds: number): Promise<number> {
    const key = `${RATE_LIMIT_PREFIX}${identifier}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    return Math.max(0, limit - count);
  }

  async getAuthAttempts(identifier: string): Promise<number> {
    const key = `${RATE_LIMIT_PREFIX}${identifier}`;
    const val = await this.redis.get(key);
    return val ? parseInt(val, 10) : 0;
  }
}


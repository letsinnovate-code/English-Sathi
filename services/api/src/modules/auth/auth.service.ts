import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import { TokenStoreService } from "../../infrastructure/redis/token-store.service";
import type {
  RegisterUserInput,
  LoginInput,
  RefreshTokenInput,
  LogoutInput,
} from "@english-sathi/validation";
import type {
  AuthSessionResponseDTO,
  AuthTokensDTO,
  AuthUserDTO,
  UserProfileDTO,
} from "@english-sathi/shared-types";
import type { JwtPayload, RefreshTokenPayload } from "../../common/interfaces/jwt-payload.interface";

const AUTH_RATE_LIMIT = 10; // max login/register attempts
const AUTH_RATE_WINDOW_SECONDS = 15 * 60; // 15 minutes

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly tokenStore: TokenStoreService,
  ) {}

  // ─── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterUserInput, ip: string): Promise<AuthSessionResponseDTO> {
    await this.enforceRateLimit(ip);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        profile: {
          create: {
            displayName: dto.displayName.trim(),
            nativeLanguage: dto.nativeLanguage,
          },
        },
      },
      include: { profile: true },
    });

    return this.buildSessionResponse(user as Parameters<typeof this.buildSessionResponse>[0]);
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async login(dto: LoginInput, ip: string): Promise<AuthSessionResponseDTO> {
    await this.enforceRateLimit(ip);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { profile: true },
    });

    if (!user || !user.passwordHash) {
      // Constant-time dummy compare to avoid timing attacks
      await bcrypt.compare(dto.password, "$2b$12$aaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatch = await this.verifyPassword(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.buildSessionResponse(user as Parameters<typeof this.buildSessionResponse>[0]);
  }

  // ─── Token Refresh ───────────────────────────────────────────────────────────

  async refreshTokens(dto: RefreshTokenInput): Promise<AuthTokensDTO> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwt.verify<RefreshTokenPayload>(dto.refreshToken, {
        secret: this.config.get<string>(
          "REFRESH_TOKEN_SECRET",
          "dev_refresh_token_secret_at_least_16_chars",
        ),
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const isValid = await this.tokenStore.isRefreshTokenValid(payload.sub, payload.jti);
    if (!isValid) {
      // Token already rotated — possible replay attack; revoke all sessions
      this.logger.warn(`Refresh token replay detected for userId=${payload.sub}`);
      await this.tokenStore.revokeAllRefreshTokens(payload.sub);
      throw new UnauthorizedException("Refresh token has been revoked or already used");
    }

    // Rotate: revoke old token and issue new pair
    await this.tokenStore.revokeRefreshToken(payload.sub, payload.jti);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });

    return this.issueTokens(user);
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────

  async logout(userId: string, dto: LogoutInput): Promise<void> {
    if (dto.allSessions) {
      await this.tokenStore.revokeAllRefreshTokens(userId);
      return;
    }

    if (dto.refreshToken) {
      try {
        const payload = this.jwt.verify<RefreshTokenPayload>(dto.refreshToken, {
          secret: this.config.get<string>(
            "REFRESH_TOKEN_SECRET",
            "dev_refresh_token_secret_at_least_16_chars",
          ),
        });
        if (payload.sub === userId) {
          await this.tokenStore.revokeRefreshToken(userId, payload.jti);
        }
      } catch {
        // Token already expired or invalid — still counts as logged out
      }
    }
  }

  // ─── Me ──────────────────────────────────────────────────────────────────────

  async getMe(
    userId: string,
  ): Promise<{ user: AuthUserDTO; profile: UserProfileDTO; onboardingRequired: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    return this.buildUserResponse(user as Parameters<typeof this.buildUserResponse>[0]);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async enforceRateLimit(ip: string): Promise<void> {
    const remaining = await this.tokenStore.consumeAuthAttempt(
      ip,
      AUTH_RATE_LIMIT,
      AUTH_RATE_WINDOW_SECONDS,
    );
    if (remaining < 0) {
      throw new HttpException(
        "Too many authentication attempts. Please wait 15 minutes before trying again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async issueTokens(user: {
    id: string;
    email: string;
    role: "STUDENT" | "ADMIN";
  }): Promise<AuthTokensDTO> {
    const jwtExpiresIn = this.config.get<string>("JWT_EXPIRES_IN", "7d");
    const refreshExpiresIn = this.config.get<string>("REFRESH_TOKEN_EXPIRES_IN", "30d");

    const accessPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti };

    const accessToken = this.jwt.sign(accessPayload as object, { expiresIn: this.parseDurationToSeconds(jwtExpiresIn) });
    const refreshToken = this.jwt.sign(refreshPayload as object, {
      secret: this.config.get<string>(
        "REFRESH_TOKEN_SECRET",
        "dev_refresh_token_secret_at_least_16_chars",
      ),
      expiresIn: this.parseDurationToSeconds(refreshExpiresIn),
    });

    // Store refresh token JTI in Redis (30-day TTL)
    const refreshTtlSeconds = 30 * 24 * 60 * 60;
    await this.tokenStore.storeRefreshToken(user.id, jti, refreshTtlSeconds);

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: this.parseDurationToSeconds(jwtExpiresIn),
      tokenType: "Bearer",
    };
  }

  private buildUserResponse(user: {
    id: string;
    email: string;
    role: "STUDENT" | "ADMIN";
    emailVerifiedAt: Date | null;
    createdAt: Date;
    profile: {
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
    } | null;
  }): { user: AuthUserDTO; profile: UserProfileDTO; onboardingRequired: boolean } {
    const authUser: AuthUserDTO = {
      id: user.id,
      email: user.email,
      role: user.role as "STUDENT" | "ADMIN",
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };

    const profile: UserProfileDTO = {
      id: user.profile?.id ?? "",
      userId: user.id,
      displayName: user.profile?.displayName ?? "",
      nativeLanguage: user.profile?.nativeLanguage ?? "hi",
      targetLanguage: user.profile?.targetLanguage ?? "en",
      explanationLanguage: user.profile?.explanationLanguage ?? "hi",
      proficiencyLevel: (user.profile?.proficiencyLevel ?? "UNKNOWN") as UserProfileDTO["proficiencyLevel"],
      dailyGoalMinutes: user.profile?.dailyGoalMinutes ?? 15,
      speakingSpeed: (user.profile?.speakingSpeed ?? "NORMAL") as UserProfileDTO["speakingSpeed"],
      learningGoals: (user.profile?.learningGoals ?? []) as UserProfileDTO["learningGoals"],
      timezone: user.profile?.timezone ?? "Asia/Kolkata",
      onboardingCompletedAt: user.profile?.onboardingCompletedAt?.toISOString() ?? null,
      createdAt: user.profile?.createdAt?.toISOString() ?? user.createdAt.toISOString(),
      updatedAt: user.profile?.updatedAt?.toISOString() ?? user.createdAt.toISOString(),
    };

    return {
      user: authUser,
      profile,
      onboardingRequired: !user.profile?.onboardingCompletedAt,
    };
  }

  private async buildSessionResponse(user: {
    id: string;
    email: string;
    role: "STUDENT" | "ADMIN";
    emailVerifiedAt: Date | null;
    createdAt: Date;
    profile: {
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
    } | null;
  }): Promise<AuthSessionResponseDTO> {
    const { user: authUser, profile, onboardingRequired } = this.buildUserResponse(user);
    const tokens = await this.issueTokens({ id: user.id, email: user.email, role: user.role as "STUDENT" | "ADMIN" });
    return { user: authUser, profile, onboardingRequired, tokens };
  }

  // ─── Password Helpers ─────────────────────────────────────────────────────

  /**
   * Hash a password with bcrypt for new registrations.
   */
  async hashPassword(password: string): Promise<string> {
    const rounds = this.config.get<number>("BCRYPT_ROUNDS", 12);
    return bcrypt.hash(password, rounds);
  }

  /**
   * Verify a password against a stored hash.
   * Supports both bcrypt ($2b$...) and legacy seed scrypt (scrypt$salt$hash) formats.
   */
  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (storedHash.startsWith("scrypt$")) {
      // Legacy seed format: scrypt$<salt>$<derivedKey>
      const { scryptSync } = await import("node:crypto");
      const parts = storedHash.split("$");
      if (parts.length !== 3) return false;
      const [, salt, expected] = parts;
      try {
        const actual = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
        return actual === expected;
      } catch {
        return false;
      }
    }
    // bcrypt format
    return bcrypt.compare(password, storedHash);
  }

  private parseDurationToSeconds(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 7 * 24 * 3600;
    const [, value, unit] = match;
    const n = parseInt(value, 10);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return n * (multipliers[unit] ?? 86400);
  }
}

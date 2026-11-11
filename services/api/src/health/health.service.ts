import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../infrastructure/database/prisma.service";
import { RedisService } from "../infrastructure/redis/redis.service";

export type DependencyStatus = "up" | "down";

export interface HealthChecks {
    database: DependencyStatus;
    redis: DependencyStatus;
}

export interface HealthReport {
    status: "ok" | "degraded";
    timestamp: string;
    uptimeSeconds: number;
    environment: string;
    version: string;
    checks: HealthChecks;
    memory: {
        heapUsedMB: number;
        heapTotalMB: number;
        rssMB: number;
    };
}

export interface ReadinessReport {
    status: "ok" | "degraded";
    ready: boolean;
    checks: HealthChecks;
}

@Injectable()
export class HealthService {
    constructor(
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) { }

    private async checkDependencies(): Promise<{ checks: HealthChecks; allUp: boolean }> {
        const [databaseUp, redisUp] = await Promise.all([
            this.prisma.isHealthy(),
            this.redis.isHealthy(),
        ]);

        return {
            checks: {
                database: databaseUp ? "up" : "down",
                redis: redisUp ? "up" : "down",
            },
            allUp: databaseUp && redisUp,
        };
    }

    /**
     * Generates a comprehensive health and diagnostics report including dependency checks.
     */
    async getDetailedHealth(): Promise<HealthReport> {
        const [{ checks, allUp }, memory] = [
            await this.checkDependencies(),
            process.memoryUsage(),
        ];
        const bytesToMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

        return {
            status: allUp ? "ok" : "degraded",
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            environment: this.configService.get<string>("NODE_ENV", "development"),
            version: "0.1.0",
            checks,
            memory: {
                heapUsedMB: bytesToMB(memory.heapUsed),
                heapTotalMB: bytesToMB(memory.heapTotal),
                rssMB: bytesToMB(memory.rss),
            },
        };
    }

    getLiveness(): { status: "ok" } {
        return { status: "ok" };
    }

    /**
     * Verifies PostgreSQL and Redis readiness, throwing HTTP 503 if any dependency is down.
     */
    async getReadiness(): Promise<ReadinessReport> {
        const { checks, allUp } = await this.checkDependencies();

        if (!allUp) {
            throw new ServiceUnavailableException({
                status: "degraded",
                ready: false,
                checks,
            });
        }

        return {
            status: "ok",
            ready: true,
            checks,
        };
    }
}

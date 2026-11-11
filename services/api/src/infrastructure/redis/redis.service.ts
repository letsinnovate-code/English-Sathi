import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly client: Redis;

    constructor(private readonly configService: ConfigService) {
        const redisUrl = this.configService.get<string>("REDIS_URL", "redis://localhost:6379");

        this.client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            connectTimeout: 2000,
            lazyConnect: true,
        });

        // Attach listener so transient connection errors never raise unhandled exceptions
        this.client.on("error", (error: Error) => {
            this.logger.warn(`Redis client error: ${error.message}`);
        });

        this.client.on("ready", () => {
            this.logger.log("Redis connection established");
        });
    }

    getClient(): Redis {
        return this.client;
    }

    /**
     * Verifies Redis connectivity with a short-timeout PING command.
     */
    async isHealthy(): Promise<boolean> {
        try {
            const response = await this.client.ping();
            return response === "PONG";
        } catch (error) {
            this.logger.warn(
                `Redis readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.status === "end") {
            return;
        }

        if (this.client.status === "wait") {
            this.client.disconnect();
            return;
        }

        try {
            await this.client.quit();
            this.logger.log("Redis connection closed");
        } catch {
            this.client.disconnect();
        }
    }
}


import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@english-sathi/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(PrismaService.name);

    async onModuleInit(): Promise<void> {
        await this.$connect();
        this.logger.log("PostgreSQL connection established via Prisma");
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
        this.logger.log("PostgreSQL connection closed");
    }

    /**
     * Executes a lightweight query to verify live PostgreSQL connectivity.
     */
    async isHealthy(): Promise<boolean> {
        try {
            await this.$queryRaw`SELECT 1`;
            return true;
        } catch (error) {
            this.logger.warn(
                `PostgreSQL readiness check failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            return false;
        }
    }
}


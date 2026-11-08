import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface HealthReport {
    status: "ok" | "degraded";
    timestamp: string;
    uptimeSeconds: number;
    environment: string;
    version: string;
    memory: {
        heapUsedMB: number;
        heapTotalMB: number;
        rssMB: number;
    };
}

@Injectable()
export class HealthService {
    constructor(private readonly configService: ConfigService) { }

    /**
     * Generates a comprehensive health and diagnostics report.
     */
    getDetailedHealth(): HealthReport {
        const memory = process.memoryUsage();
        const bytesToMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

        return {
            status: "ok",
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            environment: this.configService.get<string>("NODE_ENV", "development"),
            version: "0.1.0",
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

    getReadiness(): { status: "ok"; ready: boolean } {
        return { status: "ok", ready: true };
    }
}
import { Controller, Get } from "@nestjs/common";
import { HealthService, type HealthReport, type ReadinessReport } from "./health.service";

@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Get()
    async getHealth(): Promise<HealthReport> {
        return this.healthService.getDetailedHealth();
    }

    @Get("liveness")
    getLiveness(): { status: "ok" } {
        return this.healthService.getLiveness();
    }

    @Get("readiness")
    async getReadiness(): Promise<ReadinessReport> {
        return this.healthService.getReadiness();
    }
}

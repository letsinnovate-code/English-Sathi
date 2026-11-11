import { Controller, Get } from "@nestjs/common";
import { HealthService, type HealthReport, type ReadinessReport } from "./health.service";
import { Public } from "../common/decorators/auth.decorators";

@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Public()
    @Get()
    async getHealth(): Promise<HealthReport> {
        return this.healthService.getDetailedHealth();
    }

    @Public()
    @Get("liveness")
    getLiveness(): { status: "ok" } {
        return this.healthService.getLiveness();
    }

    @Public()
    @Get("readiness")
    async getReadiness(): Promise<ReadinessReport> {
        return this.healthService.getReadiness();
    }
}

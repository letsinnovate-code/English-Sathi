import { Controller, Get } from "@nestjs/common";
import { HealthService, type HealthReport } from "./health.service";

@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Get()
    getHealth(): HealthReport {
        return this.healthService.getDetailedHealth();
    }

    @Get("liveness")
    getLiveness(): { status: "ok" } {
        return this.healthService.getLiveness();
    }

    @Get("readiness")
    getReadiness(): { status: "ok"; ready: boolean } {
        return this.healthService.getReadiness();
    }
}
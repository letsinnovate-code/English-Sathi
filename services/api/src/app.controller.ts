import { Controller, Get, Post, Body, UsePipes } from "@nestjs/common";
import { AppService } from "./app.service";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe";
import { StartSessionSchema, type StartSessionInput } from "@english-sathi/validation";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  getHealth(): { status: string; service: string } {
    return this.appService.getHealth();
  }

  @Get()
  getRoot() {
    return {
      name: "English Sathi Core API",
      version: "0.1.0",
      docs: "/api/v1/health",
    };
  }
}
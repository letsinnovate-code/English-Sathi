import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import { Public } from "./common/decorators/auth.decorators";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getRoot() {
    return {
      ...this.appService.getHealth(),
      name: "English Sathi Core API",
      version: "0.1.0",
      docs: "/api/v1/health",
    };
  }
}
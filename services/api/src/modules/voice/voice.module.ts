import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LessonsModule } from "../lessons/lessons.module";
import { VoiceController } from "./voice.controller";
import { VoiceGateway } from "./voice.gateway";
import { VoiceQuotaService } from "./voice-quota.service";
import { VoiceService } from "./voice.service";

@Module({
  imports: [AuthModule, LessonsModule],
  controllers: [VoiceController],
  providers: [VoiceQuotaService, VoiceService, VoiceGateway],
  exports: [VoiceService, VoiceQuotaService],
})
export class VoiceModule {}


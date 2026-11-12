import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import type { ZodType, ZodTypeDef } from "zod";
import { VoiceService } from "./voice.service";
import { VoiceQuotaService } from "./voice-quota.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  CreateVoiceSessionSchema,
  EndVoiceSessionSchema,
  VoiceTurnAudioSchema,
  VoiceTurnTextSchema,
  type CreateVoiceSessionInput,
} from "@english-sathi/validation";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import type {
  CreateVoiceSessionResponseDTO,
  VoiceQuotaSummaryDTO,
  VoiceSessionDetailDTO,
  VoiceSessionDTO,
  WsSessionEndedPayload,
  WsTurnResultPayload,
} from "@english-sathi/shared-types";

@Controller("voice/sessions")
export class VoiceController {
  constructor(
    private readonly voiceService: VoiceService,
    private readonly quotaService: VoiceQuotaService,
  ) {}

  @Get("quota")
  getQuota(@CurrentUser() user: JwtPayload): Promise<VoiceQuotaSummaryDTO> {
    return this.quotaService.getQuotaSummary(user.sub);
  }

  @Post()
  createSession(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateVoiceSessionSchema)) dto: CreateVoiceSessionInput,
  ): Promise<CreateVoiceSessionResponseDTO> {
    return this.voiceService.createSession(user.sub, dto);
  }

  @Get()
  listSessions(@CurrentUser() user: JwtPayload): Promise<VoiceSessionDTO[]> {
    return this.voiceService.listSessions(user.sub);
  }

  @Get(":id")
  getSession(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) sessionId: string,
  ): Promise<VoiceSessionDetailDTO> {
    return this.voiceService.getSessionDetail(user.sub, sessionId);
  }

  @Post(":id/turns/text")
  @HttpCode(HttpStatus.OK)
  submitTextTurn(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) sessionId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<WsTurnResultPayload> {
    const parsed = this.parseOrBadRequest(VoiceTurnTextSchema, { ...body, sessionId });
    return this.voiceService.processTextTurn(user.sub, parsed);
  }

  @Post(":id/turns/audio")
  @HttpCode(HttpStatus.OK)
  submitAudioTurn(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) sessionId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<WsTurnResultPayload> {
    const parsed = this.parseOrBadRequest(VoiceTurnAudioSchema, { ...body, sessionId });
    return this.voiceService.processAudioTurn(user.sub, parsed);
  }

  @Post(":id/end")
  @HttpCode(HttpStatus.OK)
  endSession(
    @CurrentUser() user: JwtPayload,
    @Param("id", ParseUUIDPipe) sessionId: string,
    @Body() body: Record<string, unknown> = {},
  ): Promise<WsSessionEndedPayload> {
    const parsed = this.parseOrBadRequest(EndVoiceSessionSchema, { ...body, sessionId });
    return this.voiceService.endSession(user.sub, parsed.sessionId, parsed.reason);
  }

  private parseOrBadRequest<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new BadRequestException({
        message: "Request validation failed",
        error: "Bad Request",
        details: result.error.errors.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}

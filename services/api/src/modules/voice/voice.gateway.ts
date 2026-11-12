import { HttpException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import {
  EndVoiceSessionSchema,
  VoiceTurnAudioSchema,
  VoiceTurnTextSchema,
} from "@english-sathi/validation";
import type {
  WsQuotaUpdatePayload,
  WsSessionErrorPayload,
} from "@english-sathi/shared-types";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import { VoiceQuotaExceededException, VoiceService } from "./voice.service";

const SessionIdPayloadSchema = z.object({
  sessionId: z.string().uuid("sessionId must be a valid UUID"),
});

@WebSocketGateway({
  namespace: "/voice",
  maxHttpBufferSize: 8 * 1024 * 1024, // 8 MB for base64 audio turns
  cors: {
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  },
})
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(VoiceGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly voiceService: VoiceService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Connection Authentication ───────────────────────────────────────────────

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      this.emitErrorAndDisconnect(client, "UNAUTHORIZED", "Missing authentication token");
      return;
    }

    try {
      const secret = this.configService.get<string>(
        "JWT_SECRET",
        "dev_super_secret_jwt_key_at_least_16_chars",
      );
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });
      client.data.user = payload;
      this.logger.log(`WS connected: userId=${payload.sub} socketId=${client.id}`);
    } catch {
      this.emitErrorAndDisconnect(client, "UNAUTHORIZED", "Invalid or expired token");
    }
  }

  handleDisconnect(client: Socket): void {
    const user = client.data?.user as JwtPayload | undefined;
    if (user) {
      this.logger.log(`WS disconnected: userId=${user.sub} socketId=${client.id}`);
    }
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  @SubscribeMessage("session:join")
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = SessionIdPayloadSchema.safeParse(body);
    if (!parsed.success) {
      this.emitError(client, "", "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid sessionId");
      return;
    }

    const { sessionId } = parsed.data;
    try {
      const ready = await this.voiceService.joinSession(user.sub, sessionId);
      await client.join(this.roomName(sessionId));
      client.data.sessionId = sessionId;
      client.emit("session:ready", ready);
    } catch (error) {
      this.handleSessionError(client, sessionId, error);
    }
  }

  @SubscribeMessage("turn:text")
  async handleTextTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = VoiceTurnTextSchema.safeParse(body);
    if (!parsed.success) {
      const sid = this.peekSessionId(body);
      this.emitError(client, sid, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid text turn payload");
      return;
    }

    try {
      const result = await this.voiceService.processTextTurn(user.sub, parsed.data);
      client.emit("turn:result", result);
    } catch (error) {
      this.handleSessionError(client, parsed.data.sessionId, error);
    }
  }

  @SubscribeMessage("turn:audio")
  async handleAudioTurn(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = VoiceTurnAudioSchema.safeParse(body);
    if (!parsed.success) {
      const sid = this.peekSessionId(body);
      this.emitError(client, sid, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid audio turn payload");
      return;
    }

    try {
      const result = await this.voiceService.processAudioTurn(user.sub, parsed.data);
      client.emit("turn:result", result);
    } catch (error) {
      this.handleSessionError(client, parsed.data.sessionId, error);
    }
  }

  @SubscribeMessage("session:interrupt")
  async handleInterrupt(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = SessionIdPayloadSchema.safeParse(body);
    if (!parsed.success) {
      this.emitError(client, "", "VALIDATION_ERROR", "Invalid sessionId");
      return;
    }

    try {
      await this.voiceService.interruptSession(user.sub, parsed.data.sessionId);
    } catch (error) {
      this.handleSessionError(client, parsed.data.sessionId, error);
    }
  }

  @SubscribeMessage("session:heartbeat")
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = SessionIdPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return;
    }

    const { sessionId } = parsed.data;
    try {
      const status = await this.voiceService.heartbeat(user.sub, sessionId);
      if (status.expired) {
        if (status.endedPayload) {
          client.emit("session:ended", status.endedPayload);
        }
        await client.leave(this.roomName(sessionId));
        return;
      }

      const payload: WsQuotaUpdatePayload = {
        sessionId,
        quota: status.quota,
      };
      client.emit("quota:update", payload);
    } catch (error) {
      this.handleSessionError(client, sessionId, error);
    }
  }

  @SubscribeMessage("session:end")
  async handleEndSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const user = this.requireUser(client);
    if (!user) return;

    const parsed = EndVoiceSessionSchema.safeParse(body);
    if (!parsed.success) {
      const sid = this.peekSessionId(body);
      this.emitError(client, sid, "VALIDATION_ERROR", "Invalid session end payload");
      return;
    }

    const { sessionId, reason } = parsed.data;
    try {
      const ended = await this.voiceService.endSession(user.sub, sessionId, reason);
      client.emit("session:ended", ended);
      await client.leave(this.roomName(sessionId));
    } catch (error) {
      this.handleSessionError(client, sessionId, error);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private roomName(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.["token"];
    if (typeof authToken === "string" && authToken.trim().length > 0) {
      return authToken.replace(/^Bearer\s+/i, "").trim();
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7).trim();
    }
    return null;
  }

  private requireUser(client: Socket): JwtPayload | null {
    const user = client.data?.user as JwtPayload | undefined;
    if (!user) {
      this.emitErrorAndDisconnect(client, "UNAUTHORIZED", "Authentication required");
      return null;
    }
    return user;
  }

  private peekSessionId(body: unknown): string {
    if (body && typeof body === "object" && typeof (body as Record<string, unknown>)["sessionId"] === "string") {
      return (body as Record<string, unknown>)["sessionId"] as string;
    }
    return "";
  }

  private handleSessionError(client: Socket, sessionId: string, error: unknown): void {
    if (error instanceof VoiceQuotaExceededException) {
      client.emit("session:ended", error.endedPayload);
      void client.leave(this.roomName(sessionId));
      return;
    }

    if (error instanceof HttpException) {
      const status = error.getStatus();
      const resp = error.getResponse();
      const message =
        typeof resp === "string"
          ? resp
          : typeof resp === "object" && resp && typeof (resp as Record<string, unknown>)["message"] === "string"
            ? ((resp as Record<string, unknown>)["message"] as string)
            : error.message;
      this.emitError(client, sessionId, `HTTP_${status}`, message);
      return;
    }

    this.logger.error(
      `VoiceGateway unexpected error (sessionId=${sessionId}): ${error instanceof Error ? error.message : String(error)}`,
    );
    this.emitError(client, sessionId, "INTERNAL_ERROR", "An unexpected error occurred during voice processing.");
  }

  private emitError(client: Socket, sessionId: string, code: string, message: string): void {
    const payload: WsSessionErrorPayload = { sessionId, code, message };
    client.emit("session:error", payload);
  }

  private emitErrorAndDisconnect(client: Socket, code: string, message: string): void {
    this.emitError(client, "", code, message);
    client.disconnect(true);
  }
}


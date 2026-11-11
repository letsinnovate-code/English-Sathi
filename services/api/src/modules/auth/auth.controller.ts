import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Req,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../../common/decorators/auth.decorators";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  RegisterUserSchema,
  LoginSchema,
  RefreshTokenSchema,
  LogoutSchema,
  type RegisterUserInput,
  type LoginInput,
  type RefreshTokenInput,
  type LogoutInput,
} from "@english-sathi/validation";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";
import type { Request } from "express";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(RegisterUserSchema)) dto: RegisterUserInput,
    @Req() req: Request,
  ) {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace("::ffff:", "");
    return this.authService.register(dto, ip);
  }

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginInput,
    @Req() req: Request,
  ) {
    const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace("::ffff:", "");
    return this.authService.login(dto, ip);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenInput) {
    return this.authService.refreshTokens(dto);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(LogoutSchema)) dto: LogoutInput,
  ) {
    await this.authService.logout(user.sub, dto);
  }

  @Get("me")
  async getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }
}


import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  OnboardingSchema,
  UpdateProfileSchema,
  type OnboardingInput,
  type UpdateProfileInput,
} from "@english-sathi/validation";
import type { JwtPayload } from "../../common/interfaces/jwt-payload.interface";

@Controller("users/me")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("profile")
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfile(user.sub);
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Post("onboarding")
  @HttpCode(HttpStatus.OK)
  completeOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(OnboardingSchema)) dto: OnboardingInput,
  ) {
    return this.usersService.completeOnboarding(user.sub, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser() user: JwtPayload) {
    return this.usersService.deleteAccount(user.sub, user.sub);
  }
}


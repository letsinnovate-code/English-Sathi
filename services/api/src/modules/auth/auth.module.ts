import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "../../common/strategies/jwt.strategy";
import { TokenStoreService } from "../../infrastructure/redis/token-store.service";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET", "dev_super_secret_jwt_key_at_least_16_chars"),
        signOptions: {
          issuer: "english-sathi",
          audience: "english-sathi-api",
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenStoreService],
  exports: [AuthService, JwtModule, TokenStoreService],
})
export class AuthModule {}

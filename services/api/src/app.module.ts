import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { validateEnv } from "./config/env.schema";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./infrastructure/database/prisma.module";
import { RedisModule } from "./infrastructure/redis/redis.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: [".env.local", ".env", "../../.env.local", "../../.env"],
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT", 4000);
  const apiPrefix = configService.get<string>("API_PREFIX", "api/v1");
  const rawCorsOrigins = configService.get<string>(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001"
  );

  // 1. Security Headers
  app.use(helmet());

  // 2. Global route prefix
  app.setGlobalPrefix(apiPrefix);

  // 3. Global Filters & Interceptors
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // 4. Strict CORS allowlist
  const allowedOrigins = rawCorsOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  // 5. Enable graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`\n🚀 English Sathi API is running on: http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
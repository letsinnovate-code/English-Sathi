import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger("HttpException");

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = "Internal server error";
        let error = "InternalServerError";
        let details: unknown = undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === "string") {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
                const resObj = exceptionResponse as Record<string, unknown>;
                message = (resObj["message"] as string) || message;
                error = (resObj["error"] as string) || exception.name;
                details = resObj["details"] || undefined;
            }
        } else if (exception instanceof Error) {
            message = exception.message;
            this.logger.error(`Unhandled Exception at ${request.method} ${request.url}:`, exception.stack);
        }

        // Standardized API error contract
        response.status(status).json({
            success: false,
            statusCode: status,
            error,
            message,
            ...(details ? { details } : {}),
            timestamp: new Date().toISOString(),
            path: request.url,
        });
    }
}
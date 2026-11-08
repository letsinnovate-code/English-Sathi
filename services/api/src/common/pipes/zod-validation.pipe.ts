import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";
import { ZodSchema, ZodError } from "zod";

@Injectable()
export class ZodValidationPipe implements PipeTransform {
    constructor(private readonly schema: ZodSchema) { }

    transform(value: unknown) {
        const result = this.schema.safeParse(value);

        if (!result.success) {
            const error = result.error as ZodError;
            const formattedErrors = error.errors.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            }));

            throw new BadRequestException({
                message: "Request validation failed",
                error: "Bad Request",
                details: formattedErrors,
            });
        }

        return result.data;
    }
}
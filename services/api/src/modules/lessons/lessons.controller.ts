import { Controller, Get, Param, Query } from "@nestjs/common";
import { LessonsService } from "./lessons.service";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  ListLessonsQuerySchema,
  type ListLessonsQueryInput,
} from "@english-sathi/validation";
import type {
  LessonDetailDTO,
  LessonsListDTO,
  TutorPersonaDTO,
} from "@english-sathi/shared-types";

@Controller("lessons")
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get("personas")
  listPersonas(): TutorPersonaDTO[] {
    return this.lessonsService.listPersonas();
  }

  @Get()
  listLessons(
    @Query(new ZodValidationPipe(ListLessonsQuerySchema)) query: ListLessonsQueryInput,
  ): Promise<LessonsListDTO> {
    return this.lessonsService.listLessons(query);
  }

  @Get(":slugOrId")
  getLesson(@Param("slugOrId") slugOrId: string): Promise<LessonDetailDTO> {
    return this.lessonsService.getLessonBySlugOrId(slugOrId);
  }
}


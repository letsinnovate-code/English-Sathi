import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/database/prisma.service";
import type { ListLessonsQueryInput } from "@english-sathi/validation";
import type {
  LessonContentDTO,
  LessonDetailDTO,
  LessonsListDTO,
  ProficiencyLevel,
  StarterLessonSummaryDTO,
} from "@english-sathi/shared-types";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class LessonsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLessons(query: ListLessonsQueryInput): Promise<LessonsListDTO> {
    const where = {
      isPublished: true,
      ...(query.level ? { level: query.level as never } : {}),
      ...(query.category
        ? { category: { contains: query.category, mode: "insensitive" as const } }
        : {}),
    };

    const skip = (query.page - 1) * query.pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.lesson.findMany({
        where,
        orderBy: [{ level: "asc" }, { createdAt: "asc" }],
        skip,
        take: query.pageSize,
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          level: true,
          category: true,
        },
      }),
      this.prisma.lesson.count({ where }),
    ]);

    const data: StarterLessonSummaryDTO[] = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      level: row.level as ProficiencyLevel,
      category: row.category,
    }));

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getLessonBySlugOrId(slugOrId: string): Promise<LessonDetailDTO> {
    const isUuid = UUID_REGEX.test(slugOrId);
    const lesson = await this.prisma.lesson.findFirst({
      where: isUuid
        ? { id: slugOrId, isPublished: true }
        : { slug: slugOrId, isPublished: true },
    });

    if (!lesson) {
      throw new NotFoundException(`Published lesson "${slugOrId}" not found`);
    }

    return {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      description: lesson.description,
      level: lesson.level as ProficiencyLevel,
      category: lesson.category,
      content: this.parseLessonContent(lesson.content),
      isPublished: lesson.isPublished,
      createdAt: lesson.createdAt.toISOString(),
      updatedAt: lesson.updatedAt.toISOString(),
    };
  }

  private parseLessonContent(raw: unknown): LessonContentDTO {
    const obj =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

    const toStringArray = (val: unknown): string[] =>
      Array.isArray(val) ? val.filter((x): x is string => typeof x === "string") : [];

    const vocabulary = Array.isArray(obj["vocabulary"])
      ? obj["vocabulary"].filter(
          (v): v is { word: string; meaning: string } =>
            Boolean(v) &&
            typeof v === "object" &&
            typeof (v as Record<string, unknown>)["word"] === "string" &&
            typeof (v as Record<string, unknown>)["meaning"] === "string",
        )
      : undefined;

    return {
      objectives: toStringArray(obj["objectives"]),
      keyPhrases: toStringArray(obj["keyPhrases"]),
      promptStarter:
        typeof obj["promptStarter"] === "string" && obj["promptStarter"].trim().length > 0
          ? obj["promptStarter"]
          : "Hello! Let's practice English together today. How are you doing?",
      ...(vocabulary ? { vocabulary } : {}),
    };
  }
}


# System Architecture

## Overview
English Sathi is structured as a TypeScript monorepo with clean separation of concerns:

- **Frontend Clients (`apps/`)**:
  - `web/`: Learner web interface (Next.js App Router).
  - `mobile/`: iOS & Android apps (React Native / Expo).
  - `admin/`: Content and user management dashboard (Next.js App Router).

- **Backend Services (`services/`)**:
  - `api/`: NestJS backend exposing REST and real-time WebSocket endpoints.
  - `workers/`: Background job processors (BullMQ) for audio analysis, notifications, and analytics.

- **Shared Packages (`packages/`)**:
  - `database/`: Prisma schema, migrations, and shared client singleton.
  - `shared-types/`: Shared TypeScript models, contracts, and DTOs.
  - `validation/`: Zod schemas shared across clients and backend.
  - `ai/`: Prompt management and AI client integrations (Google Gemini, LLMs).


# English Sathi 🚀

English Sathi is a comprehensive AI-powered English learning platform built as a high-performance monorepo.

## 📁 Repository Structure

```
english-sathi/
│
├── apps/
│   ├── web/                 # Next.js web application
│   ├── mobile/              # React Native + Expo mobile application
│   └── admin/               # Admin dashboard (Next.js)
│
├── services/
│   ├── api/                 # NestJS backend REST & WebSocket API
│   └── workers/             # Background jobs & queue processors (BullMQ)
│
├── packages/
│   ├── database/            # Prisma schema, migrations, and database client
│   ├── shared-types/        # Shared TypeScript interfaces & DTOs
│   ├── validation/          # Shared validation schemas (Zod)
│   └── ai/                  # AI integrations & prompts (Gemini / LLMs / Speech)
│
├── infrastructure/          # Docker compose, deployment configs, and infrastructure
├── docs/                    # Architecture and developer documentation
└── package.json             # Root monorepo configuration
```

## 🛠️ Quick Start

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0 (or pnpm / yarn)
- Docker & Docker Compose (for local database & Redis)

### Installation

```bash
# Install all dependencies across the monorepo
npm install
```

### Local Services

Start PostgreSQL and Redis:
```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### Running Development

```bash
# Run all apps and services concurrently
npm run dev

# Or run specific workspaces:
npm run dev --workspace=@english-sathi/web
npm run dev --workspace=@english-sathi/api
```


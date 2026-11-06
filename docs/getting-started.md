# Getting Started

## Quick Setup

1. **Clone & Install**:
   ```bash
   npm install
   ```

2. **Start Infrastructure**:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

3. **Configure Environment**:
   Copy `.env.example` to `.env` in the root and in relevant services:
   ```bash
   cp .env.example .env
   ```

4. **Initialize Database**:
   ```bash
   npm run prisma:generate --workspace=@english-sathi/database
   npm run prisma:migrate --workspace=@english-sathi/database
   ```

5. **Start Dev Servers**:
   ```bash
   npm run dev
   ```


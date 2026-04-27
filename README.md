# GPT-image2 Web

A self-hosted Next.js site for generating and editing images through your own GPT-image2 compatible API.

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:3000.

## Docker

```bash
docker compose build
docker compose up
```

Keep real API keys in `.env` on the server. Do not expose them as `NEXT_PUBLIC_*` variables.

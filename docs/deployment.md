# Deployment

Create two Vercel projects from the GitHub repository: `afhomes-sales-web` rooted at `apps/web`, and `afhomes-sales-api` rooted at `apps/api`. Configure `APP_ENV`, `MONGODB_URI`, JWT secrets, `CRON_SECRET`, URLs, CORS, and development-adapter switches from `.env.example`. The MongoDB application user should have least privilege; Atlas access must use TLS and a strong password. Pushes to `main` are the stable deployment and other branches can create previews.

The API project runs `/api/v1/automation/daily` at 16:00 UTC (midnight in the Philippines). Vercel supplies `Authorization: Bearer $CRON_SECRET`; requests without the matching secret are rejected. The job creates idempotent 30-day expiration reminders, expires ended memberships, blocks their active cards, notifies customers, and records audit entries.

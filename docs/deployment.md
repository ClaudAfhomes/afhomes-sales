# Deployment

Create two Vercel projects from the private GitHub repository: `afhomes-sales-web` rooted at `apps/web`, and `afhomes-sales-api` rooted at `apps/api`. Configure `APP_ENV`, `MONGODB_URI`, JWT secrets, URLs, CORS, and development-adapter switches from `.env.example`. The MongoDB application user should have least privilege on `afhomes_sales_dev`; Atlas access must use TLS and a strong password. Pushes to `main` are the stable development deployment and other branches can create previews. No paid resource may be provisioned without approval.

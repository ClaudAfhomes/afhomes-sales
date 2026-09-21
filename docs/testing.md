# Testing

CI runs lint, TypeScript validation, API and web builds, and Expo Android exports. API tests cover the auth lifecycle, RBAC guards, dynamic QR validation, tier-duration activation, authoritative catalog pricing, distributed rate-limit behavior, daily expiration automation, and health contracts. Replica-set integration tests prove concurrent redemption cannot overspend and racing idempotent requests create one transaction.

Browser/mobile end-to-end tests and external notification-provider contract tests remain appropriate additions before a public production launch.

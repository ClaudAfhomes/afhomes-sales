# AFhomes Sales

Development MVP for VIP memberships, physical cards, loyalty points, POS transactions, support, reporting, notifications, audit and security workflows. It is a pnpm monorepo with a NestJS/Mongoose API, Next.js operations portal, and customer/staff clients for Expo and Flutter.

## Start locally

1. Copy `.env.example` to `.env` and set a MongoDB replica-set URI (Atlas is recommended because transactions require a replica set).
2. `corepack pnpm install`
3. `corepack pnpm db:setup && corepack pnpm db:seed && corepack pnpm db:check`
4. In separate terminals: `corepack pnpm dev:api` and `corepack pnpm dev:web`.
5. Swagger is at `http://localhost:3001/api/docs`; web is at `http://localhost:3000`.

The seed is idempotent and writes generated development login details to ignored `.dev-credentials.local.txt`. Never use development data for real customers.

## Mobile

### Expo Go (fastest phone preview)

1. Install Expo Go on the phone and connect it to the same Wi-Fi network as this computer.
2. Run `npm run expo:customer` or `npm run expo:staff` from the repository root.
3. Scan the terminal QR code with Expo Go on Android or the Camera app on iOS.
4. If LAN discovery is blocked, use `npm run expo:customer:tunnel` or `npm run expo:staff:tunnel`.

The customer app supports registration, verification, login, membership activation and a digital member QR. The staff app supports employee login, camera QR lookup and transaction submission. Both default to the deployed AFhomes API; set `EXPO_PUBLIC_API_URL` before starting to target another API.

Expo Go can preview the camera QR flow. NFC requires a custom development build because it needs native code outside Expo Go.

### Flutter

From either Flutter app: `flutter pub get`, then `flutter run --dart-define=AFHOMES_API_URL=https://your-api.example`. Build Android with `flutter build apk --debug --dart-define=AFHOMES_API_URL=...`. Generic NFC is represented by the shared `nfc_token`; native scanner integration remains an adapter boundary.

## Quality and deployment

Run `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build`. Deploy `apps/api` and `apps/web` as separate Vercel projects and configure the variables documented in `.env.example`. Details are in [docs/deployment.md](docs/deployment.md).

## Development test flow

Seed → sell an `IN_STOCK` card at `POST /api/v1/cards/sell` → identify it by printed QR/NFC/member code and activate → submit a multi-item transaction with an idempotency key → verify the membership balance and reports. Reusing an idempotency key returns the original transaction; balance changes occur inside a MongoDB transaction.

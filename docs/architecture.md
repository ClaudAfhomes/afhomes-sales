# Architecture

## Backend service boundaries

`BusinessService` currently coordinates cards, memberships, transactions, points, support, branch access, and configuration. This repair deliberately keeps that stable orchestration surface to avoid a risky functional refactor. A future backend-focused change should extract cohesive `TransactionService`, `CardService`, `MembershipService`, `AuthorizationService`, `BranchAccessService`, and `PointsService` units while retaining MongoDB session boundaries and the existing API contracts.
The system is a modular monolith: Next.js and both Flutter clients call one NestJS API backed by MongoDB. The API owns validation and transaction authority. Realtime currently uses safe polling fallback; Socket.IO is a planned transport adapter. External email, push, Google, file storage, and secure NFC are adapter boundaries and never block core operation.

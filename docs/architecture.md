# Architecture

The system is a modular monolith: Next.js and both Flutter clients call one NestJS API backed by MongoDB. The API owns validation and transaction authority. Realtime currently uses safe polling fallback; Socket.IO is a planned transport adapter. External email, push, Google, file storage, and secure NFC are adapter boundaries and never block core operation.

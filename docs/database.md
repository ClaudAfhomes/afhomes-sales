# Database

**Master data != transactional data. Transaction header != transaction item. Support header != support message.**

Master collections include countries, currencies, branches, tiers, benefits, users, and VIP cards. Operational collections include memberships, transaction headers, transaction items, points ledgers, ticket headers, ticket messages, notifications, and audit logs. Public IDs are separate from MongoDB `_id`. Money uses integer minor units plus ISO currency; authoritative dates are UTC. Unique indexes protect normalized email, public IDs, card identifiers, and transaction idempotency keys. Membership status/end-date, branch, ticket status, and ledger membership keys are indexed for operational queries.

The full target also reserves independently modeled collections for permissions, products/services, automation rules/executions, approval requests, security events, devices/sessions, card events, usage, integrations, and inbound/outbound staging. These should be added without collapsing master and transactional boundaries.

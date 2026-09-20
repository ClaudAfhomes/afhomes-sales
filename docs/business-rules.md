# Business rules

A customer is distinct from membership history and physical cards. QR, NFC and member code identify the same card. Activation code, member code and transaction PIN have different purposes. Cards transition through controlled statuses. The database is authoritative; critical point mutations and transaction header/items commit atomically. Tiers, duration, benefits, countries, currency and branch timezone are configuration, not hard-coded business rules.

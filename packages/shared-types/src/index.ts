export type CardStatus='CREATED'|'IN_STOCK'|'ISSUED'|'SOLD'|'PENDING_ACTIVATION'|'ACTIVE'|'LOST'|'STOLEN'|'BLOCKED'|'REPLACED'|'EXPIRED'|'CANCELLED';
export type Role='SUPER_ADMIN'|'ADMIN'|'BRANCH_MANAGER'|'CASHIER'|'STAFF'|'CUSTOMER_SERVICE'|'AUDITOR'|'CUSTOMER';
export interface ApiEnvelope<T>{success:true;data:T;requestId:string}

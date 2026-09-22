import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { ClientSession, Connection, HydratedDocument, Model } from "mongoose";
import * as argon2 from "argon2";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ActivateCardDto,
  CardActionDto,
  CreateTicketDto,
  CreateTransactionDto,
  MemberLookupDto,
  ReplaceCardDto,
  ReplyTicketDto,
  ReverseTransactionDto,
  SellCardDto,
  UpdateTicketDto,
  UpsertProductDto,
  UpsertTierDto,
} from "./dto";
import type { AuthenticatedUser } from "./auth.decorators";
import {
  AuditLog,
  Benefit,
  Branch,
  DynamicQrUse,
  Membership,
  Notification,
  PointsLedger,
  ProductService,
  RewardRule,
  SupportTicketHeader,
  SupportTicketMessage,
  Tier,
  TransactionHeader,
  TransactionAuthorization,
  TransactionItem,
  User,
  VipCard,
} from "./models";
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = () =>
  Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
const publicId = (prefix: string) => `${prefix}-PH-${code()}`;
@Injectable()
export class BusinessService {
  constructor(
    @InjectConnection() private db: Connection,
    @InjectModel(VipCard.name) private cards: Model<VipCard>,
    @InjectModel(Tier.name) private tiers: Model<Tier>,
    @InjectModel(Membership.name) private memberships: Model<Membership>,
    @InjectModel(TransactionHeader.name) private tx: Model<TransactionHeader>,
    @InjectModel(TransactionItem.name) private items: Model<TransactionItem>,
    @InjectModel(PointsLedger.name) private ledger: Model<PointsLedger>,
    @InjectModel(SupportTicketHeader.name)
    private tickets: Model<SupportTicketHeader>,
    @InjectModel(SupportTicketMessage.name)
    private messages: Model<SupportTicketMessage>,
    @InjectModel(Notification.name) private notices: Model<Notification>,
    @InjectModel(AuditLog.name) private audits: Model<AuditLog>,
    @InjectModel(Branch.name) private branches: Model<Branch>,
    @InjectModel(User.name) private users: Model<User>,
    @InjectModel(Benefit.name) private benefits: Model<Benefit>,
    @InjectModel(ProductService.name) private products: Model<ProductService>,
    @InjectModel(RewardRule.name) private rewardRules: Model<RewardRule>,
    @InjectModel(DynamicQrUse.name) private qrUses: Model<DynamicQrUse>,
    @InjectModel(TransactionAuthorization.name)
    private transactionAuthorizations: Model<TransactionAuthorization>,
    private jwt: JwtService,
  ) {}
  health() {
    return {
      api: "ok",
      database: this.db.readyState === 1 ? "ok" : "unavailable",
      realtime: "event-stream",
      background_jobs: "scheduled-daily",
      environment: process.env.APP_ENV || "development",
    };
  }
  async dashboard() {
    const [activeMemberships, cards, transactions, openTickets] =
      await Promise.all([
        this.memberships.countDocuments({ status: "ACTIVE" }),
        this.cards.countDocuments(),
        this.tx.countDocuments({ status: "COMMITTED" }),
        this.tickets.countDocuments({
          status: { $nin: ["CLOSED", "RESOLVED"] },
        }),
      ]);
    return { activeMemberships, cards, transactions, openTickets };
  }
  cardsList() {
    return this.cards
      .find()
      .select("-activation_code_hash -printed_qr_token -nfc_token")
      .limit(100)
      .lean();
  }
  async sell(d: SellCardDto, actorId: string) {
    const card = await this.cards.findOne({ card_public_id: d.card_public_id });
    if (!card) throw new NotFoundException("Card not found");
    if (!["IN_STOCK", "ISSUED"].includes(card.status))
      throw new ConflictException("Card cannot be sold");
    if (!(await this.tiers.exists({ tier_code: d.tier_code, is_active: true })))
      throw new BadRequestException("Tier not found");
    const activation = code();
    card.status = "PENDING_ACTIVATION";
    card.pending_tier_code = d.tier_code;
    card.sold_at = new Date();
    card.activation_code_hash = await argon2.hash(activation);
    card.activation_expires_at = new Date(Date.now() + 72 * 3600_000);
    card.activation_attempts = 0;
    card.activation_used = false;
    await card.save();
    await this.audits.create({
      actor_id: actorId,
      action: "CARD_SOLD",
      entity_type: "VIP_CARD",
      entity_id: card.card_public_id,
      request_id: publicId("REQ"),
      metadata: { tier_code: d.tier_code },
    });
    return {
      card_public_id: card.card_public_id,
      member_code: card.member_code,
      activation_code: activation,
      expires_at: card.activation_expires_at,
    };
  }
  async activate(d: ActivateCardDto, customerId: string) {
    const card = await this.cards.findOne({
      $or: [
        { card_public_id: d.card_identifier },
        { printed_qr_token: d.card_identifier },
        { nfc_token: d.card_identifier },
        { member_code: d.card_identifier },
      ],
    });
    if (!card) throw new NotFoundException("Card not found");
    if (
      card.status !== "PENDING_ACTIVATION" ||
      card.is_blocked ||
      card.activation_used
    )
      throw new ConflictException("Card cannot be activated");
    const tier = card.pending_tier_code
      ? await this.tiers
          .findOne({ tier_code: card.pending_tier_code, is_active: true })
          .lean()
      : null;
    if (!tier)
      throw new ConflictException("Purchased tier is no longer available");
    if (
      !card.activation_expires_at ||
      card.activation_expires_at < new Date() ||
      card.activation_attempts >= 5
    )
      throw new ConflictException("Activation code expired or locked");
    if (
      !card.activation_code_hash ||
      !(await argon2.verify(card.activation_code_hash, d.activation_code))
    ) {
      card.activation_attempts++;
      await card.save();
      throw new BadRequestException("Invalid activation code");
    }
    const now = new Date();
    const membershipId = publicId("MEM");
    const membership = await this.memberships.create({
      membership_public_id: membershipId,
      customer_id: customerId,
      tier_code: tier.tier_code,
      status: "ACTIVE",
      starts_at: now,
      ends_at: this.addDuration(now, tier.duration_value, tier.duration_unit),
      points_balance: 0,
    });
    Object.assign(card, {
      customer_id: customerId,
      membership_id: membershipId,
      status: "ACTIVE",
      activated_at: now,
      expires_at: membership.ends_at,
      activation_used: true,
      activation_code_hash: undefined,
      pending_tier_code: undefined,
    });
    await card.save();
    await Promise.all([
      this.audits.create({
        actor_id: customerId,
        action: "CARD_ACTIVATED",
        entity_type: "VIP_CARD",
        entity_id: card.card_public_id,
        request_id: publicId("REQ"),
        metadata: {
          membership_id: membershipId,
          tier_code: membership.tier_code,
        },
      }),
      this.notices.create({
        recipient_id: customerId,
        channel: "IN_APP",
        category: "MEMBERSHIP",
        title: "VIP membership activated",
        message: `Your ${membership.tier_code} VIP membership is now active.`,
        status: "SENT",
        sent_at: now,
      }),
    ]);
    return { card_public_id: card.card_public_id, membership };
  }
  async reportLostCard(d: CardActionDto, customerId: string) {
    const card = await this.cards.findOne({
      card_public_id: d.card_public_id,
      customer_id: customerId,
    });
    if (!card) throw new NotFoundException("Card not found");
    return this.setCardBlocked(
      card,
      "LOST",
      d.reason,
      customerId,
      "CARD_REPORTED_LOST",
    );
  }
  async blockCard(d: CardActionDto, actorId: string) {
    const card = await this.cards.findOne({ card_public_id: d.card_public_id });
    if (!card) throw new NotFoundException("Card not found");
    return this.setCardBlocked(
      card,
      "BLOCKED",
      d.reason,
      actorId,
      "CARD_BLOCKED",
    );
  }
  async replaceCard(d: ReplaceCardDto, actorId: string) {
    const session = await this.db.startSession();
    try {
      let result: unknown;
      await session.withTransaction(async () => {
        const oldCard = await this.cards
          .findOne({
            card_public_id: d.old_card_public_id,
            status: { $in: ["ACTIVE", "LOST", "BLOCKED"] },
          })
          .session(session);
        const newCard = await this.cards
          .findOne({
            card_public_id: d.new_card_public_id,
            status: { $in: ["IN_STOCK", "ISSUED"] },
          })
          .session(session);
        if (
          !oldCard ||
          !newCard ||
          !oldCard.customer_id ||
          !oldCard.membership_id
        )
          throw new ConflictException("Cards are not eligible for replacement");
        Object.assign(oldCard, {
          status: "REPLACED",
          is_blocked: true,
          replaced_by: newCard.card_public_id,
        });
        Object.assign(newCard, {
          status: "ACTIVE",
          is_blocked: false,
          customer_id: oldCard.customer_id,
          membership_id: oldCard.membership_id,
          activated_at: new Date(),
          expires_at: oldCard.expires_at,
          replaces_card: oldCard.card_public_id,
        });
        await Promise.all([
          oldCard.save({ session }),
          newCard.save({ session }),
          this.audits.create(
            [
              {
                actor_id: actorId,
                action: "CARD_REPLACED",
                entity_type: "VIP_CARD",
                entity_id: oldCard.card_public_id,
                request_id: publicId("REQ"),
                metadata: {
                  replacement_card_id: newCard.card_public_id,
                  reason: d.reason,
                },
              },
            ],
            { session },
          ),
          this.notices.create(
            [
              {
                recipient_id: oldCard.customer_id,
                channel: "IN_APP",
                category: "CARD",
                title: "VIP card replaced",
                message: `Your replacement card ${newCard.card_public_id} is active.`,
                status: "SENT",
                sent_at: new Date(),
              },
            ],
            { session },
          ),
        ]);
        result = {
          old_card_public_id: oldCard.card_public_id,
          new_card_public_id: newCard.card_public_id,
          status: "ACTIVE",
        };
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
  private async setCardBlocked(
    card: HydratedDocument<VipCard>,
    status: string,
    reason: string,
    actorId: string,
    action: string,
  ) {
    if (["REPLACED", "BLOCKED", "LOST", "STOLEN"].includes(card.status))
      throw new ConflictException("Card is already inactive");
    card.status = status;
    card.is_blocked = true;
    await card.save();
    await Promise.all([
      this.audits.create({
        actor_id: actorId,
        action,
        entity_type: "VIP_CARD",
        entity_id: card.card_public_id,
        request_id: publicId("REQ"),
        metadata: { reason },
      }),
      card.customer_id
        ? this.notices.create({
            recipient_id: card.customer_id,
            channel: "IN_APP",
            category: "CARD",
            title: "VIP card blocked",
            message: `Card ${card.card_public_id} is now ${status.toLowerCase()}.`,
            status: "SENT",
            sent_at: new Date(),
          })
        : Promise.resolve(),
    ]);
    return { card_public_id: card.card_public_id, status: card.status };
  }
  async lookupMember(d: MemberLookupDto, actorId: string) {
    const dynamic =
      d.method === "dynamic_qr_token" ? this.verifyDynamicQr(d.value) : null;
    const card = await this.cards
      .findOne(
        dynamic
          ? {
              card_public_id: dynamic.card_public_id,
              membership_id: dynamic.membership_id,
              customer_id: dynamic.customer_id,
            }
          : { [d.method]: d.value },
      )
      .lean();
    if (!card) throw new NotFoundException("Card not found");
    if (!card.membership_id || !card.customer_id)
      throw new ConflictException("Card is not activated");
    const [membership, customer] = await Promise.all([
      this.memberships
        .findOne({ membership_public_id: card.membership_id })
        .lean(),
      this.users
        .findOne({ public_id: card.customer_id })
        .select("public_id display_name email_normalized")
        .lean(),
    ]);
    if (!membership || membership.customer_id !== card.customer_id)
      throw new ConflictException("Card membership relationship is invalid");
    const benefits = await this.benefits
      .find({ tier_codes: membership.tier_code, is_active: true })
      .select("benefit_code name -_id")
      .lean();
    const remainingMs = Math.max(
      0,
      new Date(membership.ends_at).getTime() - Date.now(),
    );
    await this.audits.create({
      actor_id: actorId,
      action: "MEMBER_LOOKUP",
      entity_type: "VIP_CARD",
      entity_id: card.card_public_id,
      request_id: publicId("REQ"),
      metadata: { method: d.method },
    });
    return {
      customer: {
        public_id: customer?.public_id,
        display_name: this.maskName(customer?.display_name),
        email: this.maskEmail(customer?.email_normalized),
      },
      card: { card_public_id: card.card_public_id, status: card.status },
      membership: {
        membership_public_id: membership.membership_public_id,
        tier: membership.tier_code,
        status: membership.status,
        starts_at: membership.starts_at,
        ends_at: membership.ends_at,
        remaining_validity_seconds: Math.floor(remainingMs / 1000),
        available_points: membership.points_balance,
      },
      eligible_benefits: benefits,
    };
  }
  private maskName(value?: string) {
    if (!value) return undefined;
    return value
      .split(/\s+/)
      .map((part) =>
        part.length < 2
          ? "*"
          : `${part[0]}${"*".repeat(Math.min(3, part.length - 1))}`,
      )
      .join(" ");
  }
  private maskEmail(value?: string) {
    if (!value) return undefined;
    const [local, domain] = value.split("@");
    return domain ? `${local.slice(0, 1)}***@${domain}` : "***";
  }
  async assertBranchAccess(actor: AuthenticatedUser, branchId: string) {
    const employee = await this.users
      .findOne({ public_id: actor.sub, is_active: true })
      .lean();
    if (!employee) throw new ForbiddenException("Employee access is inactive");
    const roles = employee.roles || [];
    if (roles.includes("CUSTOMER") || !roles.some((role) => ["SUPER_ADMIN", "ADMIN", "MANAGER", "CASHIER", "CUSTOMER_SERVICE"].includes(role)))
      throw new ForbiddenException("Employee branch access is required");
    if (roles.includes("SUPER_ADMIN")) return;
    const branches = employee.branch_ids || [];
    if (roles.includes("ADMIN") && branches.length === 0) return;
    if (!branches.includes(branchId))
      throw new ForbiddenException("Employee is not authorized for this branch");
  }
  private async verifyStepUp(
    token: string | undefined,
    intent: { customer_id: string; membership_id: string; branch_id: string; points_redeemed: number; currency_code: string; transaction_type: string },
    session: ClientSession,
  ) {
    if (!token) throw new ConflictException("STEP_UP_REQUIRED");
    const authorization = await this.transactionAuthorizations.findOneAndUpdate(
      {
        token_hash: createHash("sha256").update(token).digest("hex"),
        customer_id: intent.customer_id,
        membership_id: intent.membership_id,
        branch_id: intent.branch_id,
        points_redeemed: intent.points_redeemed,
        currency_code: intent.currency_code,
        transaction_type: intent.transaction_type,
        status: "APPROVED",
        expires_at: { $gt: new Date() },
        used_at: { $exists: false },
      },
      { $set: { status: "USED", used_at: new Date() } },
      { new: true, session },
    );
    if (!authorization)
      throw new UnauthorizedException("Step-up authorization is invalid, expired, used, or does not match this transaction");
  }
  shouldRequireStepUp(
    rule: Pick<RewardRule, "step_up_amount_minor"> | null | undefined,
    amountMinor: number,
    pointsRedeemed: number,
  ) {
    return pointsRedeemed > 0 && Boolean(
      rule?.step_up_amount_minor && amountMinor >= rule.step_up_amount_minor,
    );
  }
  private async transactionResult(header: TransactionHeader) {
    const [transactionItems, membership] = await Promise.all([
      this.items
        .find({ transaction_id: header.transaction_public_id })
        .sort({ line_no: 1 })
        .lean(),
      this.memberships
        .findOne({ membership_public_id: header.membership_id })
        .lean(),
    ]);
    return {
      ...header,
      items: transactionItems,
      balance: membership?.points_balance,
    };
  }
  async transact(d: CreateTransactionDto, actorInput: AuthenticatedUser | string) {
    const actor: AuthenticatedUser = typeof actorInput === "string"
      ? { sub: actorInput, roles: ["SUPER_ADMIN"] }
      : actorInput;
    const existing = await this.tx
      .findOne({ idempotency_key: d.idempotency_key })
      .lean();
    if (existing) return this.transactionResult(existing);
    await this.assertBranchAccess(actor, d.branch_id);
    const session = await this.db.startSession();
    let usedDynamicQr = false;
    try {
      let result: unknown;
      await session.withTransaction(async () => {
        const branch = await this.branches
          .findOne({ branch_public_id: d.branch_id, is_active: true })
          .session(session)
          .lean();
        if (!branch) throw new BadRequestException("Branch is not active");
        if (branch.currency_code !== d.currency_code)
          throw new BadRequestException("Currency does not match branch");
        const now = new Date();
        const m = await this.memberships
          .findOne({
            membership_public_id: d.membership_id,
            status: "ACTIVE",
            ends_at: { $gt: now },
          })
          .session(session)
          .lean();
        if (!m) throw new BadRequestException("Membership is not active");
        let cardQuery: Record<string, unknown> = {
          membership_id: d.membership_id,
        };
        let dynamicQr:
          | ReturnType<BusinessService["verifyDynamicQr"]>
          | undefined;
        if (d.card_lookup_method && d.card_identifier) {
          if (d.card_lookup_method === "dynamic_qr_token") {
            dynamicQr = this.verifyDynamicQr(d.card_identifier);
            cardQuery = {
              card_public_id: dynamicQr.card_public_id,
              membership_id: dynamicQr.membership_id,
              customer_id: dynamicQr.customer_id,
            };
          } else cardQuery = { [d.card_lookup_method]: d.card_identifier };
        }
        const card = await this.cards
          .findOne({
            ...cardQuery,
            membership_id: d.membership_id,
            customer_id: m.customer_id,
            status: "ACTIVE",
            is_blocked: false,
          })
          .session(session)
          .lean();
        if (!card)
          throw new BadRequestException(
            "Active card and membership do not match",
          );
        if (dynamicQr && d.card_identifier) {
          usedDynamicQr = true;
          await this.qrUses.create(
            [
              {
                token_hash: createHash("sha256")
                  .update(d.card_identifier)
                  .digest("hex"),
                customer_id: dynamicQr.customer_id,
                card_public_id: dynamicQr.card_public_id,
                expires_at: new Date(dynamicQr.exp * 1000),
                used_at: now,
              },
            ],
            { session },
          );
        }
        const codes = [...new Set(d.items.map((item) => item.product_code))];
        const catalog = await this.products
          .find({
            product_code: { $in: codes },
            is_active: true,
            currency_code: branch.currency_code,
            $or: [{ branch_ids: { $size: 0 } }, { branch_ids: d.branch_id }],
          })
          .session(session)
          .lean();
        const byCode = new Map(
          catalog.map((product) => [product.product_code, product]),
        );
        if (catalog.length !== codes.length)
          throw new BadRequestException(
            "One or more products are unavailable for this branch",
          );
        const authoritativeItems = d.items.map((item) => {
          const product = byCode.get(item.product_code)!;
          return {
            product_code: product.product_code,
            description: product.name,
            quantity: item.quantity,
            unit_amount_minor: product.unit_amount_minor,
          };
        });
        const amount = authoritativeItems.reduce(
          (sum, item) => sum + item.quantity * item.unit_amount_minor,
          0,
        );
        const rules = await this.rewardRules
          .find({
            is_active: true,
            $and: [
              { $or: [{ branch_ids: { $size: 0 } }, { branch_ids: d.branch_id }] },
              { $or: [{ tier_codes: { $size: 0 } }, { tier_codes: m.tier_code }] },
            ],
          })
          .session(session)
          .lean();
        const rule = rules.sort(
          (a, b) =>
            Number(b.branch_ids.length > 0) + Number(b.tier_codes.length > 0) -
            (Number(a.branch_ids.length > 0) + Number(a.tier_codes.length > 0)),
        )[0];
        let earned =
          d.type === "SALE" && rule && amount >= rule.minimum_spend_minor
            ? Math.floor(amount / rule.points_per_amount_minor)
            : 0;
        if (rule?.max_points_per_transaction)
          earned = Math.min(earned, rule.max_points_per_transaction);
        const requiresStepUp = this.shouldRequireStepUp(
          rule,
          amount,
          d.points_redeemed,
        );
        if (requiresStepUp)
          await this.verifyStepUp(d.step_up_token, {
            customer_id: m.customer_id,
            membership_id: d.membership_id,
            branch_id: d.branch_id,
            points_redeemed: d.points_redeemed,
            currency_code: d.currency_code,
            transaction_type: d.type,
          }, session);
        const updated = await this.memberships.findOneAndUpdate(
          {
            membership_public_id: d.membership_id,
            status: "ACTIVE",
            ends_at: { $gt: now },
            points_balance: { $gte: d.points_redeemed },
          },
          { $inc: { points_balance: earned - d.points_redeemed } },
          { new: true, session },
        );
        if (!updated)
          throw new ConflictException(
            "Insufficient points or inactive membership",
          );
        const id = publicId("TXN");
        const [header] = await this.tx.create(
          [
            {
              transaction_public_id: id,
              idempotency_key: d.idempotency_key,
              branch_id: d.branch_id,
              customer_id: m.customer_id,
              membership_id: d.membership_id,
              type: d.type,
              amount_minor: amount,
              currency_code: branch.currency_code,
              points_earned: earned,
              points_redeemed: d.points_redeemed,
              status: "COMMITTED",
              transaction_at: now,
            },
          ],
          { session },
        );
        await this.items.insertMany(
          authoritativeItems.map((item, index) => ({
            transaction_id: id,
            line_no: index + 1,
            ...item,
            line_amount_minor: item.quantity * item.unit_amount_minor,
          })),
          { session },
        );
        const entries = [];
        let balance = updated.points_balance - earned + d.points_redeemed;
        if (earned) {
          balance += earned;
          entries.push({
            ledger_public_id: publicId("PTS"),
            membership_id: d.membership_id,
            transaction_id: id,
            points_delta: earned,
            balance_after: balance,
            entry_type: "EARN",
          });
        }
        if (d.points_redeemed) {
          balance -= d.points_redeemed;
          entries.push({
            ledger_public_id: publicId("PTS"),
            membership_id: d.membership_id,
            transaction_id: id,
            points_delta: -d.points_redeemed,
            balance_after: balance,
            entry_type: "REDEEM",
          });
        }
        if (entries.length) await this.ledger.insertMany(entries, { session });
        await Promise.all([
          this.audits.create(
            [
              {
                actor_id: actor.sub,
                action: d.points_redeemed
                  ? "POINTS_REDEEMED"
                  : "TRANSACTION_COMMITTED",
                entity_type: "TRANSACTION",
                entity_id: id,
                request_id: publicId("REQ"),
                metadata: {
                  card_public_id: card.card_public_id,
                  reward_rule: rule?.rule_code,
                  step_up: requiresStepUp,
                },
              },
            ],
            { session },
          ),
          this.notices.create(
            [
              {
                recipient_id: m.customer_id,
                channel: "IN_APP",
                category: "TRANSACTION",
                title: "Transaction complete",
                message: `${id} was committed.`,
                status: "SENT",
                sent_at: now,
              },
            ],
            { session },
          ),
        ]);
        result = {
          ...header.toObject(),
          items: authoritativeItems,
          balance: updated.points_balance,
        };
      });
      return result;
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const original = await this.tx
          .findOne({ idempotency_key: d.idempotency_key })
          .lean();
        if (original) return this.transactionResult(original);
        if (usedDynamicQr)
          throw new ConflictException("Dynamic QR has already been used");
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async reverseTransaction(d: ReverseTransactionDto, actorId: string) {
    const existing = await this.tx
      .findOne({ idempotency_key: d.idempotency_key })
      .lean();
    if (existing) return existing;
    const session = await this.db.startSession();
    try {
      let result: unknown;
      await session.withTransaction(async () => {
        const original = await this.tx
          .findOne({
            transaction_public_id: d.transaction_public_id,
            status: "COMMITTED",
            reversed_transaction_id: { $exists: false },
          })
          .session(session);
        if (!original)
          throw new ConflictException("Transaction is not reversible");
        if (
          await this.tx
            .exists({ reversed_transaction_id: original.transaction_public_id })
            .session(session)
        )
          throw new ConflictException("Transaction already reversed");
        const delta = original.points_redeemed - original.points_earned;
        const membership = await this.memberships.findOneAndUpdate(
          {
            membership_public_id: original.membership_id,
            ...(delta < 0 ? { points_balance: { $gte: -delta } } : {}),
          },
          { $inc: { points_balance: delta } },
          { new: true, session },
        );
        if (!membership)
          throw new ConflictException(
            "Reversal would create a negative points balance",
          );
        const reversalId = publicId("TXN");
        const [reversal] = await this.tx.create(
          [
            {
              transaction_public_id: reversalId,
              idempotency_key: d.idempotency_key,
              branch_id: original.branch_id,
              customer_id: original.customer_id,
              membership_id: original.membership_id,
              type: "REVERSAL",
              amount_minor: original.amount_minor,
              currency_code: original.currency_code,
              points_earned: 0,
              points_redeemed: 0,
              status: "COMMITTED",
              transaction_at: new Date(),
              reversed_transaction_id: original.transaction_public_id,
            },
          ],
          { session },
        );
        original.status = "REVERSED";
        await original.save({ session });
        const entries = [];
        let balance = membership.points_balance - delta;
        if (original.points_earned) {
          balance -= original.points_earned;
          entries.push({
            ledger_public_id: publicId("PTS"),
            membership_id: original.membership_id,
            transaction_id: reversalId,
            points_delta: -original.points_earned,
            balance_after: balance,
            entry_type: "REVERSAL_EARN",
          });
        }
        if (original.points_redeemed) {
          balance += original.points_redeemed;
          entries.push({
            ledger_public_id: publicId("PTS"),
            membership_id: original.membership_id,
            transaction_id: reversalId,
            points_delta: original.points_redeemed,
            balance_after: balance,
            entry_type: "REVERSAL_REDEEM",
          });
        }
        if (entries.length) await this.ledger.insertMany(entries, { session });
        await Promise.all([
          this.audits.create(
            [
              {
                actor_id: actorId,
                action: "TRANSACTION_REVERSED",
                entity_type: "TRANSACTION",
                entity_id: original.transaction_public_id,
                request_id: publicId("REQ"),
                metadata: { reversal_id: reversalId },
              },
            ],
            { session },
          ),
          this.notices.create(
            [
              {
                recipient_id: original.customer_id,
                channel: "IN_APP",
                category: "TRANSACTION",
                title: "Transaction reversed",
                message: `${original.transaction_public_id} was reversed.`,
                status: "SENT",
                sent_at: new Date(),
              },
            ],
            { session },
          ),
        ]);
        result = { ...reversal.toObject(), balance: membership.points_balance };
      });
      return result;
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        const original = await this.tx
          .findOne({ idempotency_key: d.idempotency_key })
          .lean();
        if (original) return original;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  private isDuplicateKey(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    );
  }
  listProducts(branchId?: string) {
    return this.products
      .find({
        is_active: true,
        ...(branchId
          ? { $or: [{ branch_ids: { $size: 0 } }, { branch_ids: branchId }] }
          : {}),
      })
      .sort({ kind: 1, name: 1 })
      .lean();
  }
  upsertProduct(d: UpsertProductDto, actorId: string) {
    return this.products
      .findOneAndUpdate(
        { product_code: d.product_code },
        {
          $set: {
            name: d.name,
            kind: d.kind,
            currency_code: d.currency_code,
            unit_amount_minor: d.unit_amount_minor,
            branch_ids: d.branch_ids || [],
            is_active: d.is_active !== false,
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .then(async (product) => {
        await this.audits.create({
          actor_id: actorId,
          action: "PRODUCT_CONFIGURED",
          entity_type: "PRODUCT_SERVICE",
          entity_id: d.product_code,
          request_id: publicId("REQ"),
          metadata: {
            unit_amount_minor: d.unit_amount_minor,
            currency_code: d.currency_code,
          },
        });
        return product;
      });
  }
  async configuration() {
    const [tiers, products, branches] = await Promise.all([
      this.tiers.find().sort({ rank: 1 }).lean(),
      this.products.find().sort({ kind: 1, name: 1 }).lean(),
      this.branches.find().sort({ name: 1 }).lean(),
    ]);
    return { tiers, products, branches };
  }
  upsertTier(d: UpsertTierDto, actorId: string) {
    return this.tiers
      .findOneAndUpdate(
        { tier_code: d.tier_code },
        {
          $set: {
            name: d.name,
            rank: d.rank,
            duration_value: d.duration_value,
            duration_unit: d.duration_unit,
            is_active: d.is_active !== false,
          },
        },
        { new: true, upsert: true, runValidators: true },
      )
      .then(async (tier) => {
        await this.audits.create({
          actor_id: actorId,
          action: "TIER_CONFIGURED",
          entity_type: "TIER",
          entity_id: d.tier_code,
          request_id: publicId("REQ"),
          metadata: {
            duration_value: d.duration_value,
            duration_unit: d.duration_unit,
          },
        });
        return tier;
      });
  }
  async customerDynamicQr(customerId: string) {
    const now = new Date();
    const membership = await this.memberships
      .findOne({
        customer_id: customerId,
        status: "ACTIVE",
        ends_at: { $gt: now },
      })
      .sort({ created_at: -1 })
      .lean();
    if (!membership) throw new NotFoundException("Active membership not found");
    const card = await this.cards
      .findOne({
        customer_id: customerId,
        membership_id: membership.membership_public_id,
        status: "ACTIVE",
        is_blocked: false,
      })
      .lean();
    if (!card) throw new NotFoundException("Active card not found");
    const expiresAt = new Date(Date.now() + 45_000);
    const payload = {
      card_public_id: card.card_public_id,
      membership_id: membership.membership_public_id,
      customer_id: customerId,
      exp: Math.floor(expiresAt.getTime() / 1000),
      nonce: code(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = this.dynamicQrSignature(encoded);
    return { token: `AFH:DQ:${encoded}.${signature}`, expires_at: expiresAt };
  }
  private verifyDynamicQr(token: string) {
    try {
      if (!token.startsWith("AFH:DQ:")) throw new Error();
      const [encoded, signature] = token.slice(7).split(".");
      if (!encoded || !signature) throw new Error();
      const expected = Buffer.from(this.dynamicQrSignature(encoded));
      const actual = Buffer.from(signature);
      if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
      )
        throw new Error();
      const payload = JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8"),
      ) as {
        card_public_id: string;
        membership_id: string;
        customer_id: string;
        exp: number;
      };
      if (
        !payload.card_public_id ||
        !payload.membership_id ||
        !payload.customer_id ||
        payload.exp <= Math.floor(Date.now() / 1000)
      )
        throw new Error();
      return payload;
    } catch {
      throw new BadRequestException("Dynamic QR is invalid or expired");
    }
  }
  private dynamicQrSignature(value: string) {
    const secret =
      process.env.DYNAMIC_QR_SECRET || process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("DYNAMIC_QR_SECRET is required");
    return createHmac("sha256", secret).update(value).digest("base64url");
  }
  private addDuration(start: Date, value: number, unit: string) {
    if (!Number.isInteger(value) || value < 1)
      throw new ConflictException("Tier duration is invalid");
    const end = new Date(start);
    if (unit === "DAY") end.setUTCDate(end.getUTCDate() + value);
    else if (unit === "MONTH") end.setUTCMonth(end.getUTCMonth() + value);
    else if (unit === "YEAR") end.setUTCFullYear(end.getUTCFullYear() + value);
    else throw new ConflictException("Tier duration unit is invalid");
    return end;
  }
  async report() {
    const since = new Date(Date.now() - 30 * 24 * 3600_000);
    const [
      summary,
      byTier,
      membershipStatus,
      cardStatus,
      daily,
      topProducts,
      byBranch,
      supportStatus,
    ] = await Promise.all([
      this.tx.aggregate([
        { $match: { status: "COMMITTED" } },
        {
          $group: {
            _id: "$currency_code",
            transactions: { $sum: 1 },
            amount_minor: { $sum: "$amount_minor" },
            points_earned: { $sum: "$points_earned" },
            points_redeemed: { $sum: "$points_redeemed" },
          },
        },
      ]),
      this.memberships.aggregate([
        { $group: { _id: "$tier_code", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.memberships.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      this.cards.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      this.tx.aggregate([
        { $match: { status: "COMMITTED", transaction_at: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$transaction_at" },
            },
            transactions: { $sum: 1 },
            amount_minor: { $sum: "$amount_minor" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.items.aggregate([
        {
          $group: {
            _id: "$product_code",
            description: { $first: "$description" },
            quantity: { $sum: "$quantity" },
            amount_minor: { $sum: "$line_amount_minor" },
          },
        },
        { $sort: { amount_minor: -1 } },
        { $limit: 10 },
      ]),
      this.tx.aggregate([
        { $match: { status: "COMMITTED" } },
        {
          $group: {
            _id: "$branch_id",
            transactions: { $sum: 1 },
            amount_minor: { $sum: "$amount_minor" },
          },
        },
        { $sort: { amount_minor: -1 } },
      ]),
      this.tickets.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    return {
      summary,
      byTier,
      membershipStatus,
      cardStatus,
      daily,
      topProducts,
      byBranch,
      supportStatus,
      generatedAt: new Date(),
    };
  }
  async customerHome(customerId: string) {
    const customer = await this.users
      .findOne({ public_id: customerId, is_active: true })
      .select("public_id display_name email_normalized")
      .lean();
    if (!customer) throw new NotFoundException("Customer not found");
    const membership = await this.memberships
      .findOne({ customer_id: customerId })
      .sort({ created_at: -1 })
      .lean();
    const card = membership
      ? await this.cards
          .findOne({
            customer_id: customerId,
            membership_id: membership.membership_public_id,
          })
          .select("-activation_code_hash -printed_qr_token -nfc_token")
          .lean()
      : null;
    return {
      customer: {
        public_id: customer.public_id,
        display_name: customer.display_name,
        email: customer.email_normalized,
      },
      membership: membership
        ? {
            membership_public_id: membership.membership_public_id,
            tier: membership.tier_code,
            status: membership.status,
            starts_at: membership.starts_at,
            ends_at: membership.ends_at,
            available_points: membership.points_balance,
          }
        : null,
      card: card
        ? {
            card_public_id: card.card_public_id,
            member_code: card.member_code,
            status: card.status,
          }
        : null,
    };
  }
  customerTransactions(customerId: string) {
    return this.tx
      .find({ customer_id: customerId })
      .sort({ transaction_at: -1 })
      .limit(100)
      .lean();
  }
  customerNotifications(customerId: string) {
    return this.notices
      .find({ recipient_id: customerId })
      .sort({ created_at: -1 })
      .limit(100)
      .lean();
  }
  async customerEvents(customerId: string, after?: string) {
    const parsed = after ? new Date(after) : new Date();
    const since = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const deadline = Date.now() + 20_000;
    do {
      const events = await this.notices
        .find({ recipient_id: customerId, created_at: { $gt: since } })
        .sort({ created_at: 1 })
        .limit(50)
        .lean();
      if (events.length)
        return {
          events,
          cursor: new Date(events.at(-1)!.created_at).toISOString(),
        };
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    return { events: [], cursor: new Date().toISOString() };
  }
  async runDailyAutomation(now = new Date()) {
    const day = 24 * 3600_000;
    const reminderEnd = new Date(now.getTime() + 60 * day);
    const [expiring, expired] = await Promise.all([
      this.memberships
        .find({ status: "ACTIVE", ends_at: { $gt: now, $lte: reminderEnd } })
        .limit(1000)
        .lean(),
      this.memberships
        .find({ status: "ACTIVE", ends_at: { $lte: now } })
        .limit(500)
        .lean(),
    ]);
    let remindersCreated = 0;
    for (const membership of expiring) {
      const remaining = new Date(membership.ends_at).getTime() - now.getTime();
      const milestone = [60, 30, 7, 1].find(
        (days) => remaining > (days - 1) * day && remaining <= days * day,
      );
      if (!milestone) continue;
      const eventKey = `MEMBERSHIP_EXPIRING_${milestone}D:${membership.membership_public_id}:${new Date(membership.ends_at).toISOString()}`;
      const result = await this.notices.updateOne(
        { event_key: eventKey },
        {
          $setOnInsert: {
            event_key: eventKey,
            recipient_id: membership.customer_id,
            channel: "IN_APP",
            category: "MEMBERSHIP",
            title: `VIP membership expires in ${milestone} day${milestone === 1 ? "" : "s"}`,
            message: `Your ${membership.tier_code} VIP membership expires on ${new Date(membership.ends_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}.`,
            status: "SENT",
            sent_at: now,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) remindersCreated++;
    }
    let membershipsExpired = 0;
    for (const candidate of expired) {
      const membership = await this.memberships.findOneAndUpdate(
        {
          membership_public_id: candidate.membership_public_id,
          status: "ACTIVE",
          ends_at: { $lte: now },
        },
        { $set: { status: "EXPIRED" } },
        { new: true },
      );
      if (!membership) continue;
      membershipsExpired++;
      await Promise.all([
        this.cards.updateMany(
          { membership_id: membership.membership_public_id, status: "ACTIVE" },
          { $set: { status: "EXPIRED", is_blocked: true } },
        ),
        this.notices.updateOne(
          {
            event_key: `MEMBERSHIP_EXPIRED:${membership.membership_public_id}`,
          },
          {
            $setOnInsert: {
              event_key: `MEMBERSHIP_EXPIRED:${membership.membership_public_id}`,
              recipient_id: membership.customer_id,
              channel: "IN_APP",
              category: "MEMBERSHIP",
              title: "VIP membership expired",
              message: `Your ${membership.tier_code} VIP membership has expired.`,
              status: "SENT",
              sent_at: now,
            },
          },
          { upsert: true },
        ),
        this.audits.create({
          actor_id: "SYSTEM",
          action: "MEMBERSHIP_EXPIRED",
          entity_type: "MEMBERSHIP",
          entity_id: membership.membership_public_id,
          request_id: publicId("REQ"),
          metadata: { ends_at: membership.ends_at },
        }),
      ]);
    }
    return {
      success: true,
      processed_at: now,
      reminders_created: remindersCreated,
      memberships_expired: membershipsExpired,
    };
  }
  async createTicket(d: CreateTicketDto, customerId: string) {
    const ticketId = publicId("CS");
    const ticket = await this.tickets.create({
      ticket_public_id: ticketId,
      customer_id: customerId,
      status: "OPEN",
      subject: d.subject,
      priority: "NORMAL",
    });
    await this.messages.create({
      ticket_id: ticketId,
      author_id: customerId,
      body: d.message,
      is_internal: false,
    });
    await this.audits.create({
      actor_id: customerId,
      action: "SUPPORT_TICKET_CREATED",
      entity_type: "SUPPORT_TICKET",
      entity_id: ticketId,
      request_id: publicId("REQ"),
      metadata: {},
    });
    return ticket;
  }
  listCustomerTickets(customerId: string) {
    return this.tickets
      .find({ customer_id: customerId })
      .sort({ created_at: -1 })
      .lean();
  }
  async ticketDetails(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.tickets
      .findOne({ ticket_public_id: ticketId })
      .lean();
    if (!ticket) throw new NotFoundException("Ticket not found");
    const isStaff = user.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE"].includes(role),
    );
    if (!isStaff && ticket.customer_id !== user.sub)
      throw new NotFoundException("Ticket not found");
    const messages = await this.messages
      .find({ ticket_id: ticketId, ...(isStaff ? {} : { is_internal: false }) })
      .sort({ created_at: 1 })
      .lean();
    return { ticket, messages };
  }
  async replyTicket(
    ticketId: string,
    d: ReplyTicketDto,
    user: AuthenticatedUser,
  ) {
    const ticket = await this.tickets.findOne({ ticket_public_id: ticketId });
    if (!ticket) throw new NotFoundException("Ticket not found");
    const isStaff = user.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE"].includes(role),
    );
    if (!isStaff && ticket.customer_id !== user.sub)
      throw new NotFoundException("Ticket not found");
    if (!isStaff && d.is_internal)
      throw new BadRequestException("Customers cannot create internal notes");
    const message = await this.messages.create({
      ticket_id: ticketId,
      author_id: user.sub,
      body: d.message,
      is_internal: isStaff && d.is_internal === true,
    });
    await this.audits.create({
      actor_id: user.sub,
      action: "SUPPORT_MESSAGE_CREATED",
      entity_type: "SUPPORT_TICKET",
      entity_id: ticketId,
      request_id: publicId("REQ"),
      metadata: { internal: message.is_internal },
    });
    if (isStaff)
      await this.notices.create({
        recipient_id: ticket.customer_id,
        channel: "IN_APP",
        category: "SUPPORT",
        title: "Support replied",
        message: `Ticket ${ticketId} has a new reply.`,
        status: "SENT",
        sent_at: new Date(),
      });
    return message;
  }
  async updateTicket(ticketId: string, d: UpdateTicketDto, actorId: string) {
    const update: Record<string, unknown> = {};
    if (d.status) update.status = d.status;
    if (d.priority) update.priority = d.priority;
    if (d.assigned_to) update.assigned_to = d.assigned_to;
    if (d.status === "CLOSED" || d.status === "RESOLVED")
      update.closed_at = new Date();
    const ticket = await this.tickets.findOneAndUpdate(
      { ticket_public_id: ticketId },
      { $set: update },
      { new: true },
    );
    if (!ticket) throw new NotFoundException("Ticket not found");
    await Promise.all([
      this.audits.create({
        actor_id: actorId,
        action: "SUPPORT_TICKET_UPDATED",
        entity_type: "SUPPORT_TICKET",
        entity_id: ticketId,
        request_id: publicId("REQ"),
        metadata: update,
      }),
      this.notices.create({
        recipient_id: ticket.customer_id,
        channel: "IN_APP",
        category: "SUPPORT",
        title: "Support ticket updated",
        message: `Ticket ${ticketId} is now ${ticket.status}.`,
        status: "SENT",
        sent_at: new Date(),
      }),
    ]);
    return ticket;
  }
  listTickets() {
    return this.tickets.find().sort({ created_at: -1 }).lean();
  }
}

import {BadRequestException,NotFoundException} from '@nestjs/common';
import * as argon2 from 'argon2';
import {BusinessService} from '../src/business.service';

const model = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  exists: jest.fn(),
  create: jest.fn(),
});

function service() {
  const cards = model();
  const tiers = model();
  const memberships = model();
  const audits = model();
  const empty = model();
  const instance = new BusinessService(
    {} as never,
    cards as never,
    tiers as never,
    memberships as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    audits as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    empty as never,
    {} as never,
  );
  return {instance, cards, tiers, memberships, empty};
}

describe('VIP card entitlement and ownership', () => {
  it.each(['GOLD', 'SILVER'])('persists a %s sale entitlement and activates that tier', async (tierCode) => {
    const {instance, cards, tiers, memberships} = service();
    const card: Record<string, unknown> & {save: jest.Mock} = {
      card_public_id: 'CARD-1',
      member_code: 'MEMBER-1',
      printed_qr_token: 'QR-1',
      nfc_token: 'NFC-1',
      status: 'IN_STOCK',
      is_blocked: false,
      activation_used: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    cards.findOne.mockResolvedValue(card);
    tiers.exists.mockResolvedValue(true);
    tiers.findOne.mockReturnValue({lean:jest.fn().mockResolvedValue({tier_code:tierCode,duration_value:tierCode==='GOLD'?2:3,duration_unit:tierCode==='GOLD'?'DAY':'MONTH'})});
    memberships.create.mockImplementation(async (value) => value);

    const sale = await instance.sell({card_public_id: 'CARD-1', tier_code: tierCode}, 'EMP-1');
    expect(card.pending_tier_code).toBe(tierCode);
    expect(sale.activation_code).toBeDefined();

    card.activation_code_hash = await argon2.hash(sale.activation_code);
    card.activation_expires_at = new Date(Date.now() + 60_000);
    await instance.activate({card_identifier: 'QR-1', activation_code: sale.activation_code}, 'CUS-A');

    expect(memberships.create).toHaveBeenCalledWith(expect.objectContaining({customer_id: 'CUS-A', tier_code: tierCode}));
    const created=memberships.create.mock.calls[0][0] as {starts_at:Date;ends_at:Date};
    expect(created.ends_at.getTime()).toBeGreaterThan(created.starts_at.getTime()+(tierCode==='GOLD'?1:80)*24*3600_000);
    expect(card.customer_id).toBe('CUS-A');
  });

  it('rejects an invalid or inactive tier at sale', async () => {
    const {instance, cards, tiers} = service();
    cards.findOne.mockResolvedValue({card_public_id: 'CARD-1', status: 'IN_STOCK'});
    tiers.exists.mockResolvedValue(false);
    await expect(instance.sell({card_public_id: 'CARD-1', tier_code: 'RETIRED'}, 'EMP-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the authenticated customer id even if a forged body field is supplied', async () => {
    const {instance, cards, tiers, memberships} = service();
    const activationCode = 'ACTIVATION-1';
    const card: Record<string, unknown> & {save: jest.Mock} = {
      card_public_id: 'CARD-1', status: 'PENDING_ACTIVATION', is_blocked: false, activation_used: false,
      pending_tier_code: 'GOLD', activation_code_hash: await argon2.hash(activationCode),
      activation_expires_at: new Date(Date.now() + 60_000), activation_attempts: 0,
      save: jest.fn().mockResolvedValue(undefined),
    };
    cards.findOne.mockResolvedValue(card);
    tiers.exists.mockResolvedValue(true);
    tiers.findOne.mockReturnValue({lean:jest.fn().mockResolvedValue({tier_code:'GOLD',duration_value:1,duration_unit:'YEAR'})});
    memberships.create.mockImplementation(async (value) => value);

    await instance.activate({card_identifier: 'CARD-1', activation_code: activationCode, customer_id: 'CUS-B'} as never, 'CUS-A');
    expect(memberships.create).toHaveBeenCalledWith(expect.objectContaining({customer_id: 'CUS-A'}));
    expect(card.customer_id).toBe('CUS-A');
  });

  it('does not disclose Customer B support tickets to Customer A', async () => {
    const {instance, empty} = service();
    empty.findOne.mockReturnValue({lean: jest.fn().mockResolvedValue({ticket_public_id:'CS-1',customer_id:'CUS-B'})});
    await expect(instance.ticketDetails('CS-1',{sub:'CUS-A',roles:['CUSTOMER']})).rejects.toBeInstanceOf(NotFoundException);
    expect(empty.find).not.toHaveBeenCalled();
  });

  it('scopes lost-card reports to the authenticated customer', async () => {
    const {instance, cards} = service();
    cards.findOne.mockResolvedValue(null);
    await expect(instance.reportLostCard({card_public_id:'CARD-B',reason:'Lost'},'CUS-A')).rejects.toBeInstanceOf(NotFoundException);
    expect(cards.findOne).toHaveBeenCalledWith({card_public_id:'CARD-B',customer_id:'CUS-A'});
  });
});

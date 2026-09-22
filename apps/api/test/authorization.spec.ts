import {ForbiddenException,UnauthorizedException} from '@nestjs/common';
import {BusinessService} from '../src/business.service';

const empty=()=>({findOne:jest.fn(),findOneAndUpdate:jest.fn()});

function setup(){
  const users=empty();
  const authorizations=empty();
  const model=empty();
  const service=new BusinessService(
    {} as never,model as never,model as never,model as never,model as never,
    model as never,model as never,model as never,model as never,model as never,
    model as never,model as never,users as never,model as never,model as never,
    model as never,model as never,authorizations as never,{} as never,
  );
  return {service,users,authorizations};
}

const employee=(roles:string[],branch_ids:string[])=>({
  public_id:'EMP-1',roles,branch_ids,is_active:true,
});

describe('employee branch authorization',()=>{
  it('allows an employee assigned to the requested branch',async()=>{
    const{service,users}=setup();
    users.findOne.mockReturnValue({lean:jest.fn().mockResolvedValue(employee(['CASHIER'],['BR-A']))});
    await expect(service.assertBranchAccess({sub:'EMP-1',roles:['CASHIER']},'BR-A')).resolves.toBeUndefined();
  });
  it('rejects the same employee at another branch',async()=>{
    const{service,users}=setup();
    users.findOne.mockReturnValue({lean:jest.fn().mockResolvedValue(employee(['CASHIER'],['BR-A']))});
    await expect(service.assertBranchAccess({sub:'EMP-1',roles:['CASHIER']},'BR-B')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows a multi-branch manager only at an authorized branch',async()=>{
    const{service,users}=setup();
    users.findOne.mockReturnValue({lean:jest.fn().mockResolvedValue(employee(['MANAGER'],['BR-A','BR-B']))});
    await expect(service.assertBranchAccess({sub:'EMP-1',roles:['MANAGER']},'BR-B')).resolves.toBeUndefined();
    await expect(service.assertBranchAccess({sub:'EMP-1',roles:['MANAGER']},'BR-C')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects customers from employee branch operations',async()=>{
    const{service,users}=setup();
    users.findOne.mockReturnValue({lean:jest.fn().mockResolvedValue(employee(['CUSTOMER'],[]))});
    await expect(service.assertBranchAccess({sub:'CUS-1',roles:['CUSTOMER']},'BR-A')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows SUPER_ADMIN global scope and unscoped ADMIN global scope',async()=>{
    const{service,users}=setup();
    users.findOne.mockReturnValueOnce({lean:jest.fn().mockResolvedValue(employee(['SUPER_ADMIN'],[]))});
    await expect(service.assertBranchAccess({sub:'EMP-1',roles:['SUPER_ADMIN']},'BR-Z')).resolves.toBeUndefined();
    users.findOne.mockReturnValueOnce({lean:jest.fn().mockResolvedValue(employee(['ADMIN'],[]))});
    await expect(service.assertBranchAccess({sub:'EMP-1',roles:['ADMIN']},'BR-Z')).resolves.toBeUndefined();
  });
});

describe('transaction-bound step-up authorization',()=>{
  const intent={customer_id:'CUS-1',membership_id:'MEM-1',branch_id:'BR-A',points_redeemed:5000,currency_code:'PHP',transaction_type:'REDEEM'};
  const session={} as never;
  it('does not require step-up below the configured threshold',()=>{
    const{service}=setup();
    expect(service.shouldRequireStepUp({step_up_amount_minor:10000},9999,5000)).toBe(false);
    expect(service.shouldRequireStepUp({step_up_amount_minor:10000},10000,5000)).toBe(true);
  });
  it('accepts one approved, unexpired, matching authorization',async()=>{
    const{service,authorizations}=setup();
    authorizations.findOneAndUpdate.mockResolvedValue({status:'USED'});
    await expect((service as any).verifyStepUp('secret',intent,session)).resolves.toBeUndefined();
    expect(authorizations.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining(intent),expect.objectContaining({$set:expect.objectContaining({status:'USED'})}),expect.objectContaining({session}));
  });
  it.each(['DECLINED','EXPIRED','USED'])('rejects a %s authorization',async()=>{
    const{service,authorizations}=setup();
    authorizations.findOneAndUpdate.mockResolvedValue(null);
    await expect((service as any).verifyStepUp('secret',intent,session)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each([
    ['points',{points_redeemed:4999}],['membership',{membership_id:'MEM-2'}],['branch',{branch_id:'BR-B'}],
    ['customer',{customer_id:'CUS-2'}],['currency',{currency_code:'USD'}],['type',{transaction_type:'SALE'}],
  ])('rejects a mismatched %s intent',async(_label,change)=>{
    const{service,authorizations}=setup();
    authorizations.findOneAndUpdate.mockResolvedValue(null);
    await expect((service as any).verifyStepUp('secret',{...intent,...change},session)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects replay after the authorization is consumed',async()=>{
    const{service,authorizations}=setup();
    authorizations.findOneAndUpdate.mockResolvedValueOnce({status:'USED'}).mockResolvedValueOnce(null);
    await (service as any).verifyStepUp('secret',intent,session);
    await expect((service as any).verifyStepUp('secret',intent,session)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

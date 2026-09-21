import {BusinessService} from '../src/business.service';
import {UnauthorizedException} from '@nestjs/common';
import {AppController} from '../src/app.controller';

const query=(value:unknown)=>({limit:jest.fn().mockReturnValue({lean:jest.fn().mockResolvedValue(value)})});

function setup(expiring:unknown[]=[],expired:unknown[]=[]){
 const cards={updateMany:jest.fn().mockResolvedValue({modifiedCount:1})};
 const memberships={find:jest.fn().mockImplementation((filter:{ends_at:{$gt?:Date}})=>query(filter.ends_at.$gt?expiring:expired)),findOneAndUpdate:jest.fn()};
 const notices={updateOne:jest.fn().mockResolvedValue({upsertedCount:1})};
 const audits={create:jest.fn().mockResolvedValue({})};
 const empty={};
 const service=new BusinessService({readyState:1} as never,cards as never,empty as never,memberships as never,empty as never,empty as never,empty as never,empty as never,empty as never,notices as never,audits as never,empty as never,empty as never,empty as never,empty as never);
 return{service,cards,memberships,notices,audits};
}

describe('daily membership automation',()=>{
 const now=new Date('2026-09-21T00:00:00.000Z');
 it.each([60,30,7,1])('creates an idempotent %s-day expiration reminder',async(days)=>{const endsAt=new Date(now.getTime()+days*24*3600_000);const membership={membership_public_id:'MEM-1',customer_id:'CUS-1',tier_code:'GOLD',ends_at:endsAt};const{service,notices}=setup([membership],[]);const result=await service.runDailyAutomation(now);expect(result).toEqual(expect.objectContaining({reminders_created:1,memberships_expired:0}));expect(notices.updateOne).toHaveBeenCalledWith({event_key:`MEMBERSHIP_EXPIRING_${days}D:MEM-1:${endsAt.toISOString()}`},expect.objectContaining({$setOnInsert:expect.objectContaining({recipient_id:'CUS-1'})}),{upsert:true})});
 it('atomically expires membership and its active cards',async()=>{const membership={membership_public_id:'MEM-2',customer_id:'CUS-2',tier_code:'SILVER',ends_at:new Date('2026-09-20T00:00:00.000Z')};const{service,cards,memberships,audits}=setup([],[membership]);memberships.findOneAndUpdate.mockResolvedValue({...membership,status:'EXPIRED'});const result=await service.runDailyAutomation(now);expect(result.memberships_expired).toBe(1);expect(cards.updateMany).toHaveBeenCalledWith({membership_id:'MEM-2',status:'ACTIVE'},{$set:{status:'EXPIRED',is_blocked:true}});expect(audits.create).toHaveBeenCalledWith(expect.objectContaining({actor_id:'SYSTEM',action:'MEMBERSHIP_EXPIRED',entity_id:'MEM-2'}))});
 it('does not duplicate work when another invocation already expired the membership',async()=>{const candidate={membership_public_id:'MEM-3',customer_id:'CUS-3',tier_code:'BRONZE',ends_at:new Date('2026-09-20T00:00:00.000Z')};const{service,cards,memberships}=setup([],[candidate]);memberships.findOneAndUpdate.mockResolvedValue(null);const result=await service.runDailyAutomation(now);expect(result.memberships_expired).toBe(0);expect(cards.updateMany).not.toHaveBeenCalled()});
});

describe('automation endpoint authentication',()=>{
 it('requires the configured Vercel cron bearer secret',async()=>{const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='test-cron-secret';try{const runDailyAutomation=jest.fn().mockResolvedValue({success:true});const controller=new AppController({} as never,{runDailyAutomation} as never);expect(()=>controller.dailyAutomation({headers:{authorization:'Bearer wrong'}})).toThrow(UnauthorizedException);await expect(controller.dailyAutomation({headers:{authorization:'Bearer test-cron-secret'}})).resolves.toEqual({success:true});expect(runDailyAutomation).toHaveBeenCalledTimes(1)}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous}});
});

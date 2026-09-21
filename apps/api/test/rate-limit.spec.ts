import {ExecutionContext,HttpException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {RateLimitGuard} from '../src/rate-limit.guard';

const context={getHandler:()=>null,getClass:()=>null,switchToHttp:()=>({getRequest:()=>({ip:'203.0.113.10',route:{path:'/login'}})})} as unknown as ExecutionContext;

describe('distributed rate limit guard',()=>{
 it('uses an atomic shared bucket and rejects requests above the limit',async()=>{const reflector={getAllAndOverride:jest.fn().mockReturnValue({limit:2,windowMs:60_000,eventType:'LOGIN_RATE_LIMITED'})} as unknown as Reflector;const events={create:jest.fn().mockResolvedValue({})};const buckets={findOneAndUpdate:jest.fn().mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:2}).mockResolvedValueOnce({count:3})};const guard=new RateLimitGuard(reflector,events as never,buckets as never);await expect(guard.canActivate(context)).resolves.toBe(true);await expect(guard.canActivate(context)).resolves.toBe(true);await expect(guard.canActivate(context)).rejects.toBeInstanceOf(HttpException);expect(buckets.findOneAndUpdate).toHaveBeenCalledTimes(3);expect(events.create).toHaveBeenCalledWith(expect.objectContaining({event_type:'LOGIN_RATE_LIMITED',metadata:expect.objectContaining({distributed:true})}))});
});

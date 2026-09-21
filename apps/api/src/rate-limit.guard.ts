import {CanActivate,ExecutionContext,HttpException,HttpStatus,Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {createHash,randomUUID} from 'node:crypto';
import {RATE_LIMIT_KEY,type RateLimitOptions,type AuthenticatedUser} from './auth.decorators';
import {RateLimitBucket,SecurityEvent} from './models';

@Injectable()
export class RateLimitGuard implements CanActivate{
 constructor(private reflector:Reflector,@InjectModel(SecurityEvent.name)private events:Model<SecurityEvent>,@InjectModel(RateLimitBucket.name)private buckets:Model<RateLimitBucket>){}
 async canActivate(context:ExecutionContext){const options=this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY,[context.getHandler(),context.getClass()]);if(!options)return true;const request=context.switchToHttp().getRequest<{ip?:string;route?:{path?:string};url?:string;user?:AuthenticatedUser}>();const now=Date.now();const route=request.route?.path||request.url||'unknown';const windowId=Math.floor(now/options.windowMs);const identity=request.user?.sub||request.ip||'unknown';const bucketKey=createHash('sha256').update(`${identity}:${route}:${windowId}`).digest('hex');const expiresAt=new Date((windowId+1)*options.windowMs+60_000);let bucket;try{bucket=await this.buckets.findOneAndUpdate({bucket_key:bucketKey},{$inc:{count:1},$setOnInsert:{expires_at:expiresAt}},{new:true,upsert:true})}catch(error){if(typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:number}).code===11000)bucket=await this.buckets.findOneAndUpdate({bucket_key:bucketKey},{$inc:{count:1}},{new:true});else throw error}if(bucket&&bucket.count<=options.limit)return true;void this.events.create({event_public_id:`SEC-PH-${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`,actor_id:request.user?.sub,event_type:options.eventType,severity:'HIGH',ip_address:request.ip,metadata:{route,limit:options.limit,window_ms:options.windowMs,distributed:true}}).catch(()=>undefined);throw new HttpException('Too many attempts; try again later',HttpStatus.TOO_MANY_REQUESTS)}
}

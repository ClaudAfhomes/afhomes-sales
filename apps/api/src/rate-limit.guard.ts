import {CanActivate,ExecutionContext,HttpException,HttpStatus,Injectable} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {InjectModel} from '@nestjs/mongoose';
import {Model} from 'mongoose';
import {randomUUID} from 'node:crypto';
import {RATE_LIMIT_KEY,type RateLimitOptions,type AuthenticatedUser} from './auth.decorators';
import {SecurityEvent} from './models';

type Bucket={count:number;resetAt:number};

@Injectable()
export class RateLimitGuard implements CanActivate{
 private buckets=new Map<string,Bucket>();
 constructor(private reflector:Reflector,@InjectModel(SecurityEvent.name)private events:Model<SecurityEvent>){}
 canActivate(context:ExecutionContext){const options=this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY,[context.getHandler(),context.getClass()]);if(!options)return true;const request=context.switchToHttp().getRequest<{ip?:string;route?:{path?:string};url?:string;user?:AuthenticatedUser}>();const now=Date.now();const route=request.route?.path||request.url||'unknown';const key=`${request.ip||'unknown'}:${route}`;let bucket=this.buckets.get(key);if(!bucket||bucket.resetAt<=now){bucket={count:0,resetAt:now+options.windowMs};this.buckets.set(key,bucket)}bucket.count++;if(bucket.count<=options.limit)return true;void this.events.create({event_public_id:`SEC-PH-${randomUUID().replaceAll('-','').slice(0,16).toUpperCase()}`,actor_id:request.user?.sub,event_type:options.eventType,severity:'HIGH',ip_address:request.ip,metadata:{route,limit:options.limit,window_ms:options.windowMs}}).catch(()=>undefined);throw new HttpException('Too many attempts; try again later',HttpStatus.TOO_MANY_REQUESTS)}
}

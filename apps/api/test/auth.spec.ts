import {UnauthorizedException} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import * as argon2 from 'argon2';
import {createHash} from 'node:crypto';
import {AuthService} from '../src/auth.service';

jest.mock('argon2',()=>({argon2id:2,hash:jest.fn(async(value:string)=>`hash:${value}`),verify:jest.fn(async(hash:string,value:string)=>hash===`hash:${value}`)}));

const doc=<T extends Record<string,unknown>>(values:T):T&{save:jest.Mock}=>({...values,save:jest.fn().mockResolvedValue(undefined)});

function setup(){
 const users={exists:jest.fn(),create:jest.fn(),findOne:jest.fn()};
 const sessions={create:jest.fn(),findOne:jest.fn(),updateMany:jest.fn()};
 const challenges={create:jest.fn(),findOne:jest.fn(),updateMany:jest.fn()};
 const security={create:jest.fn()};
 const authorizations={create:jest.fn()};
 const jwt={signAsync:jest.fn(async(payload:Record<string,unknown>)=>payload.type==='refresh'?'refresh-token':'access-token'),verifyAsync:jest.fn()} as unknown as JwtService;
 return{service:new AuthService(users as never,sessions as never,challenges as never,security as never,authorizations as never,jwt),users,sessions,challenges,security,authorizations,jwt};
}

describe('customer authentication',()=>{
 beforeEach(()=>{process.env.JWT_ACCESS_SECRET='access-secret-for-tests-123456789';process.env.JWT_REFRESH_SECRET='refresh-secret-for-tests-12345678';process.env.ENABLE_DEV_INBOX='true'});

 it('registers with Argon2id and stores only a hashed OTP',async()=>{const{service,users,challenges}=setup();users.exists.mockResolvedValue(false);users.create.mockImplementation(async(value)=>doc(value));challenges.updateMany.mockResolvedValue({});challenges.create.mockResolvedValue({});const result=await service.register('Customer@Example.com','Customer','strong-password');expect(argon2.hash).toHaveBeenCalledWith('strong-password',expect.objectContaining({type:argon2.argon2id}));expect(users.create).toHaveBeenCalledWith(expect.objectContaining({email_normalized:'customer@example.com',roles:['CUSTOMER']}));expect(challenges.create).toHaveBeenCalledWith(expect.objectContaining({code_hash:expect.stringMatching(/^hash:/)}));expect((challenges.create.mock.calls[0][0] as {code_hash:string}).code_hash).not.toBe(result.development_code)});

 it('creates hashed refresh-token session records after verified login',async()=>{const{service,users,sessions}=setup();users.findOne.mockResolvedValue(doc({public_id:'CUS-A',display_name:'A',password_hash:'hash:password-123',roles:['CUSTOMER'],is_verified:true,is_active:true}));sessions.create.mockResolvedValue({});const result=await service.login('a@example.com','password-123');expect(result).toEqual(expect.objectContaining({access_token:'access-token',refresh_token:'refresh-token'}));expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({user_id:'CUS-A',refresh_token_hash:expect.not.stringMatching(/refresh-token/)}))});

 it('rejects login for an unverified customer',async()=>{const{service,users}=setup();users.findOne.mockResolvedValue(doc({public_id:'CUS-A',password_hash:'hash:password-123',roles:['CUSTOMER'],is_verified:false,is_active:true}));await expect(service.login('a@example.com','password-123')).rejects.toBeInstanceOf(UnauthorizedException)});

 it('rotates refresh tokens and revokes the prior session',async()=>{const{service,users,sessions,jwt}=setup();(jwt.verifyAsync as jest.Mock).mockResolvedValue({sub:'CUS-A',sid:'SES-OLD',family:'FAM-1',type:'refresh'});const old=doc({session_public_id:'SES-OLD',user_id:'CUS-A',refresh_token_hash:createHash('sha256').update('refresh-token').digest('hex'),token_family:'FAM-1',expires_at:new Date(Date.now()+60_000),device_name:'phone',revoked_at:undefined as Date|undefined,replaced_by:undefined as string|undefined});sessions.findOne.mockResolvedValue(old);users.findOne.mockResolvedValue(doc({public_id:'CUS-A',display_name:'A',roles:['CUSTOMER'],is_verified:true,is_active:true}));sessions.create.mockResolvedValue({});await service.refresh('refresh-token');expect(old.revoked_at).toBeInstanceOf(Date);expect(old.replaced_by).toMatch(/^SES-/);expect(sessions.create).toHaveBeenCalledWith(expect.objectContaining({token_family:'FAM-1'}))});
});

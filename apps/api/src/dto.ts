import {ArrayMinSize,IsArray,IsEmail,IsIn,IsInt,IsOptional,IsPositive,IsString,Length,Min,ValidateNested} from 'class-validator'; import {Type} from 'class-transformer';
export class LoginDto{@IsEmail() email!:string;@IsString() @Length(8,128) password!:string}
export class SellCardDto{@IsString() card_public_id!:string;@IsString() tier_code!:string}
export class ActivateCardDto{@IsString() card_identifier!:string;@IsString() activation_code!:string}
export class MemberLookupDto{@IsIn(['printed_qr_token','nfc_token','member_code','card_public_id']) method!:'printed_qr_token'|'nfc_token'|'member_code'|'card_public_id';@IsString() value!:string}
export class ItemDto{@IsString() product_code!:string;@IsString() description!:string;@IsInt() @IsPositive() quantity!:number;@IsInt() @Min(0) unit_amount_minor!:number}
export class CreateTransactionDto{@IsString() idempotency_key!:string;@IsString() branch_id!:string;@IsString() membership_id!:string;@IsOptional() @IsIn(['printed_qr_token','nfc_token','member_code','card_public_id']) card_lookup_method?:'printed_qr_token'|'nfc_token'|'member_code'|'card_public_id';@IsOptional() @IsString() card_identifier?:string;@IsIn(['SALE','REDEEM']) type!:string;@IsString() currency_code!:string;@IsInt() @Min(0) points_redeemed=0;@IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>ItemDto) items!:ItemDto[]}
export class ReverseTransactionDto{@IsString() idempotency_key!:string;@IsString() transaction_public_id!:string}
export class CreateTicketDto{@IsString() @Length(3,160) subject!:string;@IsString() @Length(1,4000) message!:string}

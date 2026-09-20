import {ArrayMinSize,IsArray,IsEmail,IsIn,IsInt,IsNotEmpty,IsPositive,IsString,Length,Min,ValidateNested} from 'class-validator'; import {Type} from 'class-transformer';
export class LoginDto{@IsEmail() email!:string;@IsString() @Length(8,128) password!:string}
export class SellCardDto{@IsString() card_public_id!:string;@IsString() tier_code!:string}
export class ActivateCardDto{@IsString() card_identifier!:string;@IsString() activation_code!:string;@IsString() customer_id!:string}
export class ItemDto{@IsString() product_code!:string;@IsString() description!:string;@IsInt() @IsPositive() quantity!:number;@IsInt() @Min(0) unit_amount_minor!:number}
export class CreateTransactionDto{@IsString() idempotency_key!:string;@IsString() branch_id!:string;@IsString() membership_id!:string;@IsIn(['SALE','REDEEM']) type!:string;@IsString() currency_code!:string;@IsInt() @Min(0) points_redeemed=0;@IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>ItemDto) items!:ItemDto[]}
export class CreateTicketDto{@IsString() customer_id!:string;@IsString() @Length(3,160) subject!:string;@IsString() @Length(1,4000) message!:string}

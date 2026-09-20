import {Body,Controller,Get,Post} from '@nestjs/common'; import {ApiBearerAuth,ApiTags} from '@nestjs/swagger'; import {AuthService} from './auth.service'; import {BusinessService} from './business.service'; import {Public,Roles} from './auth.decorators'; import {ActivateCardDto,CreateTicketDto,CreateTransactionDto,LoginDto,SellCardDto} from './dto';
const STAFF=['SUPER_ADMIN','ADMIN','MANAGER','CASHIER','CUSTOMER_SERVICE'];
@Controller() export class AppController{constructor(private auth:AuthService,private business:BusinessService){}
 @Public() @Get('health') health(){return this.business.health()}
 @Public() @ApiTags('auth') @Post('api/v1/auth/login') login(@Body() d:LoginDto){return this.auth.login(d.email,d.password)}
 @ApiBearerAuth() @Roles(...STAFF) @ApiTags('operations') @Get('api/v1/dashboard') dashboard(){return this.business.dashboard()}
 @ApiBearerAuth() @Roles(...STAFF) @ApiTags('cards') @Get('api/v1/cards') cards(){return this.business.cardsList()}
 @ApiBearerAuth() @Roles('SUPER_ADMIN','ADMIN','MANAGER','CASHIER') @ApiTags('cards') @Post('api/v1/cards/sell') sell(@Body() d:SellCardDto){return this.business.sell(d)}
 @ApiBearerAuth() @Roles('SUPER_ADMIN','ADMIN','CUSTOMER') @ApiTags('cards') @Post('api/v1/cards/activate') activate(@Body() d:ActivateCardDto){return this.business.activate(d)}
 @ApiBearerAuth() @Roles('SUPER_ADMIN','ADMIN','MANAGER','CASHIER') @ApiTags('transactions') @Post('api/v1/transactions') transact(@Body() d:CreateTransactionDto){return this.business.transact(d)}
 @ApiBearerAuth() @Roles('SUPER_ADMIN','ADMIN','MANAGER') @ApiTags('reports') @Get('api/v1/reports/summary') report(){return this.business.report()}
 @ApiBearerAuth() @Roles('SUPER_ADMIN','ADMIN','CUSTOMER','CUSTOMER_SERVICE') @ApiTags('support') @Post('api/v1/support/tickets') ticket(@Body() d:CreateTicketDto){return this.business.createTicket(d)}
 @ApiBearerAuth() @Roles('SUPER_ADMIN','ADMIN','CUSTOMER_SERVICE') @ApiTags('support') @Get('api/v1/support/tickets') tickets(){return this.business.listTickets()}}

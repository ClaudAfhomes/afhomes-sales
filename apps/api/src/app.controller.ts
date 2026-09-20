import {Body,Controller,Get,Post} from '@nestjs/common'; import {ApiTags} from '@nestjs/swagger'; import {AuthService} from './auth.service'; import {BusinessService} from './business.service'; import {ActivateCardDto,CreateTicketDto,CreateTransactionDto,LoginDto,SellCardDto} from './dto';
@Controller() export class AppController{constructor(private auth:AuthService,private business:BusinessService){}
 @Get('health') health(){return this.business.health()}
 @ApiTags('auth') @Post('api/v1/auth/login') login(@Body() d:LoginDto){return this.auth.login(d.email,d.password)}
 @ApiTags('operations') @Get('api/v1/dashboard') dashboard(){return this.business.dashboard()}
 @ApiTags('cards') @Get('api/v1/cards') cards(){return this.business.cardsList()}
 @ApiTags('cards') @Post('api/v1/cards/sell') sell(@Body() d:SellCardDto){return this.business.sell(d)}
 @ApiTags('cards') @Post('api/v1/cards/activate') activate(@Body() d:ActivateCardDto){return this.business.activate(d)}
 @ApiTags('transactions') @Post('api/v1/transactions') transact(@Body() d:CreateTransactionDto){return this.business.transact(d)}
 @ApiTags('reports') @Get('api/v1/reports/summary') report(){return this.business.report()}
 @ApiTags('support') @Post('api/v1/support/tickets') ticket(@Body() d:CreateTicketDto){return this.business.createTicket(d)}
 @ApiTags('support') @Get('api/v1/support/tickets') tickets(){return this.business.listTickets()}}

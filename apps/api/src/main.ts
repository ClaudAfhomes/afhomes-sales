import 'reflect-metadata'; import {NestFactory} from '@nestjs/core'; import {ValidationPipe} from '@nestjs/common'; import {SwaggerModule,DocumentBuilder} from '@nestjs/swagger'; import helmet from 'helmet'; import {AppModule} from './app.module';
let cached:any;
export async function createApp(){const app=await NestFactory.create(AppModule);app.use(helmet());app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));app.enableCors({origin:(process.env.CORS_ORIGINS||'http://localhost:3000').split(','),credentials:true});if((process.env.APP_ENV||'development')==='development'){const doc=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('AFhomes Sales API').setVersion('1.0').addBearerAuth().build());SwaggerModule.setup('api/docs',app,doc)}return app}
async function handler(req:any,res:any){if(!cached){const app=await createApp();await app.init();cached=app.getHttpAdapter().getInstance()}return cached(req,res)}
if(require.main===module){createApp().then(app=>app.listen(Number(process.env.PORT||3001)))}
export default handler;

import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Catch,type ExceptionFilter,type ArgumentsHost,HttpException} from '@nestjs/common';
import type {NestExpressApplication} from '@nestjs/platform-express';
import type {Request,Response,NextFunction} from 'express';
import {AppModule} from './app.module.js';
import {prisma} from '@goober/db';
import {CommerceError} from '@goober/commerce';
import {environment} from './env.js';
@Catch()
class SafeErrorFilter implements ExceptionFilter{
 catch(error:unknown,host:ArgumentsHost){const response=host.switchToHttp().getResponse<Response>();const parser=error as {status?:number;type?:string};const status=error instanceof CommerceError?error.status:error instanceof HttpException?error.getStatus():['entity.parse.failed','entity.too.large'].includes(parser?.type??'')?(parser.status??400):500;
 const message=error instanceof CommerceError||error instanceof HttpException?error.message:status===500?'Request could not be completed':'Check the request body and size';
 const code=error instanceof CommerceError?error.code:status===500?'INTERNAL_ERROR':'HTTP_'+status;
 response.status(status).setHeader('Cache-Control','no-store');response.json({error:{code,message}});
 }
}
export async function bootstrap(){
 const app=await NestFactory.create<NestExpressApplication>(AppModule,{rawBody:true,logger:['error','warn']});
 app.useBodyParser('json',{limit:'64kb'});
 const express=app.getHttpAdapter().getInstance();express.disable('x-powered-by');express.set('trust proxy',false);
 const port=Number(process.env.API_PORT??3001);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Invalid loopback API port');
 const allowedHosts=new Set([new URL(environment.origin).host,'127.0.0.1:'+port]);
 app.use((request:Request,response:Response,next:NextFunction)=>{
 response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('X-Frame-Options','DENY');response.setHeader('Referrer-Policy','no-referrer');
 if(typeof request.headers.host!=='string'||!allowedHosts.has(request.headers.host)){response.status(400).json({error:{code:'INVALID_HOST',message:'Request host is not allowed'}});return;}next();});
 app.useGlobalFilters(new SafeErrorFilter());app.enableShutdownHooks();await app.listen(port,'127.0.0.1');return app;
}
const app=await bootstrap();
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void app.close().then(()=>prisma.$disconnect());});
console.log('GOOBER API ready on loopback; data environment '+environment.environment);

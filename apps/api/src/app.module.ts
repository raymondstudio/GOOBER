import {Controller,Get,Req,UseGuards,Module,ServiceUnavailableException} from '@nestjs/common';
import {prisma} from '@goober/db';
import {Redis} from 'ioredis';
import {AuthGuard,AdminGuard,type AuthenticatedRequest} from './auth.guard.js';
import {environment} from './env.js';
import {CommerceController} from './commerce.controller.js';
import {WebhooksController} from './webhooks.js';
@Controller('api/v1')
export class SkeletonController{
 @Get('me') @UseGuards(AuthGuard) me(@Req()r:AuthenticatedRequest){const {id,email,name,role}=r.actor;return {id,email,name,role,environment:environment.environment};}
 @Get('health/live') live(){return {status:'ok',environment:environment.environment};}
 @Get('health/ready') async ready(){const redis=new Redis(environment.redisUrl,{lazyConnect:true,maxRetriesPerRequest:1,connectTimeout:1500,retryStrategy:()=>null});redis.on('error',()=>undefined);try{await prisma.$queryRaw`SELECT 1`;await redis.connect();await redis.ping();return {status:'ready',database:'ready',queue:'ready',environment:environment.environment};}catch{throw new ServiceUnavailableException('Local database or queue unavailable');}finally{redis.disconnect();}}
}
@Module({controllers:[SkeletonController,CommerceController,WebhooksController],providers:[AuthGuard,AdminGuard]})
export class AppModule{}

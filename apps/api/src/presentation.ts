import { BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import { prisma } from '@goober/db';
import { open } from '@goober/commerce';
import type { ProductDto } from '@goober/contracts';
import type { Product, SupportRequest } from '@goober/db';
import type { z } from 'zod';
export function parse<T>(schema:z.ZodType<T>,body:unknown):T {const result=schema.safeParse(body);if(!result.success)throw new BadRequestException('Check the request fields and try again');return result.data;}
export function productDto(p:Product):ProductDto {return {id:p.id,name:p.name,description:p.description,category:p.category,priceMinor:p.retailMinor.toString(),currency:'NGN',terms:p.terms,provider:p.provider as 'PAI'|'GRAML',mode:p.providerMode as ProductDto['mode'],published:p.published,version:p.version};}
export function supportDto(s:SupportRequest){const value=open<{message:string}>(JSON.parse(s.message),{orderId:s.id,provider:'SUPPORT',environment:s.environment});return {id:s.id,orderId:s.orderId,message:value.message,status:s.status,createdAt:s.createdAt.toISOString()};}
export async function ownerOrder(ownerId:string,id:string){if(id.length>128)throw new NotFoundException('Order was not found');const row=await prisma.order.findFirst({where:{id,ownerId,environment:'test'},include:{product:true,quote:true}});if(!row)throw new NotFoundException('Order was not found');return row;}
export function pageArgs(query:Record<string,unknown>){const limit=query.limit===undefined?20:Number(query.limit);if(!Number.isInteger(limit)||limit<1||limit>100)throw new BadRequestException('Page size must be between 1 and 100');const cursor=query.cursor;if(cursor!==undefined&&(typeof cursor!=='string'||cursor.length>128))throw new BadRequestException('Invalid cursor');return {limit,cursor:cursor as string|undefined};}
export async function rateLimit(ownerId:string,action:string,max=20,window=60000){const now=BigInt(Date.now()),cutoff=now-BigInt(window),key='business:'+action+':'+ownerId;
const rows=await prisma.$queryRaw<{count:number}[]>`INSERT INTO "RateLimit"(id,key,count,"lastRequest") VALUES(${key},${key},1,${now}) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN "RateLimit"."lastRequest"<${cutoff} THEN 1 ELSE "RateLimit".count+1 END,"lastRequest"=CASE WHEN "RateLimit"."lastRequest"<${cutoff} THEN ${now} ELSE "RateLimit"."lastRequest" END RETURNING count`;
if(rows[0]!.count>max)throw new HttpException('Please wait before trying this action again',429);}

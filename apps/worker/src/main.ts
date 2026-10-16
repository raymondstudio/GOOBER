import { pathToFileURL } from 'node:url';
import { Queue,Worker } from 'bullmq';
import { prisma } from '@goober/db';
import { loadEnvironment } from '../../api/src/env.js';
import { processInbox,processOutbox,tick } from './processor.js';
export { processInbox,processOutbox,tick,LEASE_MS,MAX_ATTEMPTS } from './processor.js';
export { PostgresFixtureStore } from './fixture-store.js';
export { RedisRequestBudget } from './budget.js';
export const WORK_QUEUE='goober-m1';
/** URL options must be parsed: ioredis ignores a url property in its options-object overload. */
export function redisConnectionFromUrl(value:string){
  let url:URL;
  try{url=new URL(value);}catch{throw new Error('Invalid Redis connection configuration');}
  if(!['redis:','rediss:'].includes(url.protocol)||!url.hostname||url.search||url.hash||!/^\/(?:[0-9]|1[0-5])?$/.test(url.pathname||'/'))throw new Error('Invalid Redis connection configuration');
  const host=url.hostname.replace(/^\[|\]$/g,'');const port=Number(url.port||6379);const db=Number(url.pathname.slice(1)||0);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid Redis connection configuration');
  let username:string;let password:string;
  try{username=decodeURIComponent(url.username);password=decodeURIComponent(url.password);}catch{throw new Error('Invalid Redis connection configuration');}
  return {host,port,db,...(username?{username}:{}),...(password?{password}:{}),...(url.protocol==='rediss:'?{tls:{}}:{}),maxRetriesPerRequest:null};
}
export async function startWorker(options:{queueName?:string;prefix?:string;pollMs?:number;poll?:boolean}={}){
  const env=loadEnvironment();const queueName=options.queueName??WORK_QUEUE;
  const connection=redisConnectionFromUrl(env.redisUrl);const prefix=options.prefix??'goober';
  const queue=new Queue(queueName,{connection,prefix});
  const worker=new Worker<{kind:'inbox'|'outbox';id:string}>(queueName,async job=>{
    if(typeof job.data?.id!=='string'||job.data.id.length>128||!['inbox','outbox'].includes(job.data.kind))throw new Error('Invalid durable job identity');
    if(job.data.kind==='inbox')await processInbox(job.data.id);else await processOutbox(job.data.id);
  },{connection,prefix,concurrency:2,lockDuration:60000});
  let closing=false;let polling=false;let queueErrorReported=false;
  worker.on('error',()=>{if(!queueErrorReported){console.warn('Worker queue unavailable; PostgreSQL work remains durable');queueErrorReported=true;}});
  queue.on('error',()=>undefined);
  async function poll(){if(closing||polling)return;polling=true;try{await tick(queue);queueErrorReported=false;}catch{if(!queueErrorReported){console.warn('Worker polling paused; durable work will be retried');queueErrorReported=true;}}finally{polling=false;}}
  const interval=options.poll===false?undefined:setInterval(()=>void poll(),options.pollMs??1000);interval?.unref();
  await worker.waitUntilReady();if(options.poll!==false)await poll();
  return {queue,worker,async close(){closing=true;if(interval)clearInterval(interval);while(polling)await new Promise(resolve=>setTimeout(resolve,25));await worker.close();await queue.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const runtime=await startWorker();let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await runtime.close();await prisma.$disconnect();process.exitCode=0;};
  process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
  console.log('GOOBER persistent worker ready: test data, explicit supplier modes, concurrency 2');
}

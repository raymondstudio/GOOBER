import { Redis } from 'ioredis';
import type { RequestBudget } from '@goober/providers';
import { ProviderError } from '@goober/providers';
import { createHash } from 'node:crypto';

/** One Redis budget per supplier account/key; ordinary calls leave four slots for recovery. */
export class RedisRequestBudget implements RequestBudget {
  constructor(private readonly redis:Redis,private readonly limit=60){if(!Number.isInteger(limit)||limit<5||limit>60)throw new ProviderError('invalid-request-budget');}
  private key(scope:string){return `goober:budget:${createHash('sha256').update(scope).digest('hex')}`;}
  async acquire(scope:string,recovery:boolean):Promise<void>{
    const now=Math.floor(Date.now()/1000);const key=this.key(scope);const ceiling=recovery?this.limit:this.limit-4;
    const allowed=await this.redis.eval(`local blocked=redis.call('GET',KEYS[2]);if blocked and tonumber(blocked)>tonumber(ARGV[2]) then return 0 end;local n=tonumber(redis.call('GET',KEYS[1]) or '0');if n>=tonumber(ARGV[1]) then return 0 end;n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return 1`,2,key,`${key}:blocked`,ceiling,now);
    if(Number(allowed)!==1)throw new ProviderError('request-budget-exhausted');
  }
  async observe(scope:string,remaining:number,resetEpoch:number):Promise<void>{
    if(!Number.isInteger(remaining)||remaining<0||!Number.isInteger(resetEpoch))return;
    const now=Math.floor(Date.now()/1000);
    if(resetEpoch>now&&resetEpoch-now<=3600)await this.redis.eval("local n=tonumber(redis.call('GET',KEYS[1]) or '0');if n<tonumber(ARGV[1]) then redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]) end;return 1",1,this.key(scope),Math.max(0,this.limit-remaining),Math.min(resetEpoch-now,60));
    if(remaining===0&&resetEpoch>now&&resetEpoch-now<=3600)await this.redis.set(`${this.key(scope)}:blocked`,String(resetEpoch),'EX',resetEpoch-now);
  }
}

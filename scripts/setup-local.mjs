import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
const secret=()=>randomBytes(32).toString('hex');
if(existsSync('.env')) {
 let text=readFileSync('.env','utf8');
 if(!/^PAI_FIXTURE_WEBHOOK_SECRET=/m.test(text)&&/^APP_ENV=(local|test)$/m.test(text)&&/^DATA_ENV=test$/m.test(text)){
  text+='\nPAI_FIXTURE_WEBHOOK_SECRET='+secret()+'\n';writeFileSync('.env',text,{mode:0o600});
 }
 console.log('Existing configuration and secrets preserved.');process.exit(0);
}
mkdirSync('.local',{recursive:true});
const runtime=secret(),migrator=secret();
const values={APP_ENV:'local',DATA_ENV:'test',PAYMENT_MODE:'fixture',PAI_MODE:'fixture',GRAML_MODE:'fixture',POSTGRES_PASSWORD:migrator,DATABASE_URL:`postgresql://goober_runtime:${runtime}@127.0.0.1:54329/goober`,DIRECT_DATABASE_URL:`postgresql://goober_migrator:${migrator}@127.0.0.1:54329/goober`,REDIS_URL:'redis://127.0.0.1:6389',BETTER_AUTH_URL:'http://127.0.0.1:3000',TRUSTED_ORIGIN:'http://127.0.0.1:3000',BETTER_AUTH_SECRET:secret(),FIXTURE_WEBHOOK_SECRET:secret(),PAI_FIXTURE_WEBHOOK_SECRET:secret(),DELIVERY_KEY_ID:'local-v1',DELIVERY_KEY:randomBytes(32).toString('base64'),DISPATCH_PAUSED:'false'};
writeFileSync('.env',Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
console.log('Created ignored isolated-local configuration with independent generated secrets.');

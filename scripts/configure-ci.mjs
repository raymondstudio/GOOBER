import {readFileSync,writeFileSync} from 'node:fs';
if(process.env.CI!=='true') throw new Error('CI configuration only');
const p=readFileSync('.env','utf8').replace(/^DIRECT_DATABASE_URL=.*$/m,'DIRECT_DATABASE_URL=postgresql://goober_migrator:isolated-ci-only@127.0.0.1:54329/goober');
writeFileSync('.env',p);

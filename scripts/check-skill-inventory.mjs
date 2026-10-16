import {readFileSync,existsSync} from 'node:fs';
import {parse} from 'yaml';
const required=['playwright','security-best-practices','security-threat-model','goober-financial-invariants','goober-provider-recovery'];
for(const name of required){
 const p='.agents/skills/'+name+'/SKILL.md'; if(!existsSync(p))throw new Error('Missing skill '+name);
 const text=readFileSync(p,'utf8'); const match=/^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
 if(!match)throw new Error('Missing frontmatter '+name);
 const meta=parse(match[1]);if(meta.name!==name||!meta.description)throw new Error('Invalid metadata '+name);
 console.log(name+': discoverable instructions verified');
}

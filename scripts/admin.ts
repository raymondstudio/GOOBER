import { prisma } from '@goober/db';
const email=process.argv[2];
if(!['local','test'].includes(process.env.APP_ENV??'')||process.env.DATA_ENV!=='test') throw new Error('Bootstrap is isolated local/test only');
if(!email||!email.includes('@')) throw new Error('Usage: pnpm admin:grant user@example.test');
try{
 await prisma.$transaction(async tx=>{
  const user=await tx.user.findUnique({where:{email}});
  if(!user)throw new Error('Register the account first');
  await tx.user.update({where:{id:user.id},data:{role:'ADMIN'}});
  await tx.auditEvent.create({data:{actorId:user.id,environment:'test',action:'ADMIN_BOOTSTRAP',aggregateId:user.id,reason:'Owner-authorized local bootstrap',metadata:{source:'local-cli'}}});
 });
 console.log('Administrator granted with an audit record.');
}finally{await prisma.$disconnect();}

import type { NextConfig } from 'next';
const apiOrigin=process.env.INTERNAL_API_ORIGIN??(process.env.APP_ENV==='production'?undefined:'http://127.0.0.1:3001');
if(!apiOrigin)throw new Error('INTERNAL_API_ORIGIN is required in production');
const internal=new URL(apiOrigin);
const localOrigin=internal.protocol==='http:'&&['127.0.0.1','localhost'].includes(internal.hostname);
if(internal.origin!==apiOrigin||(!localOrigin&&internal.protocol!=='https:'))throw new Error('INTERNAL_API_ORIGIN must be an exact HTTP(S) origin');
const config:NextConfig={
 distDir:process.env.NEXT_DIST_DIR??'.next',
 transpilePackages:['@goober/auth','@goober/db','@goober/contracts'],
 serverExternalPackages:['@prisma/client','@prisma/adapter-pg','pg'],
 experimental:{cpus:2},
 async rewrites(){return [{source:'/api/v1/:path*',destination:apiOrigin+'/api/v1/:path*'}];},
 async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}];}
};export default config;

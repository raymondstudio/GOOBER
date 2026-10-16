import type { NextConfig } from 'next';
const apiOrigin=process.env.INTERNAL_API_ORIGIN??'http://127.0.0.1:3001';
const internal=new URL(apiOrigin);
if(internal.protocol!=='http:'||internal.hostname!=='127.0.0.1'||internal.origin!==apiOrigin)throw new Error('Internal API must be an exact loopback origin');
const config:NextConfig={
 distDir:process.env.NEXT_DIST_DIR??'.next',
 transpilePackages:['@goober/auth','@goober/db','@goober/contracts'],
 serverExternalPackages:['@prisma/client','@prisma/adapter-pg','pg'],
 experimental:{cpus:2},
 async rewrites(){return [{source:'/api/v1/:path*',destination:apiOrigin+'/api/v1/:path*'}];},
 async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}];}
};export default config;

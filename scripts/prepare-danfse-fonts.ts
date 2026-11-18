import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {getSupabaseConfig} from '../src/lib/config.ts';
import {serviceKey} from '../src/lib/server-config.ts';
import {danfseFontProfile,readDanfseFonts,verifyDanfseFont,NT008_FONT_FILES,PRIVATE_DANFSE_FONT_BUCKET,PRIVATE_DANFSE_FONT_DIRECTORY,MAX_DANFSE_FONT_BYTES,DanfseFontError} from '../src/lib/nfse/danfse-fonts.ts';

type FontStorage={getBucket:()=>Promise<{private:boolean}>;download:(file:string)=>Promise<Uint8Array>};
/** Called during a private build, never during PDF generation or by a customer endpoint. */
export async function prepareDanfseFonts(options:{env:Record<string,string|undefined>;root?:string;storage?:FontStorage}){
 const profile=danfseFontProfile(options.env.DANFSE_FONT_PROFILE),root=options.root??process.cwd();
 if(profile==='portable')return {profile};
 if(options.env.DANFSE_FONT_SOURCE==='local'){await readDanfseFonts(profile,root);return {profile};}
 if(options.env.DANFSE_FONT_SOURCE!==undefined&&options.env.DANFSE_FONT_SOURCE!=='supabase')throw new DanfseFontError('profile_invalid');
 let storage=options.storage;
 if(!storage){
  const config=getSupabaseConfig(options.env),key=serviceKey(options.env);
  if(!config||!key)throw new DanfseFontError('assets_unavailable');
  const admin=createClient(config.url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(8_000)})}});
  storage={
   async getBucket(){const result=await admin.storage.getBucket(PRIVATE_DANFSE_FONT_BUCKET);if(result.error||!result.data||result.data.id!==PRIVATE_DANFSE_FONT_BUCKET)throw new DanfseFontError('assets_unavailable');return {private:result.data.public===false};},
   async download(file){const result=await admin.storage.from(PRIVATE_DANFSE_FONT_BUCKET).download(file);if(result.error||!result.data||result.data.size>MAX_DANFSE_FONT_BYTES)throw new DanfseFontError('assets_unavailable');return new Uint8Array(await result.data.arrayBuffer());},
  };
 }
 if((await storage.getBucket()).private!==true)throw new DanfseFontError('assets_unavailable');
 const fonts:{file:string;bytes:Buffer}[]=[];
 for(const spec of NT008_FONT_FILES){
  const bytes=Buffer.from(await storage.download(spec.file));verifyDanfseFont(bytes,profile,spec.role);fonts.push({file:spec.file,bytes});
 }
 // Verify both files before writing either. A failed build cannot publish a partial font set.
 const directory=path.join(root,PRIVATE_DANFSE_FONT_DIRECTORY);await mkdir(directory,{recursive:true,mode:0o700});
 for(const font of fonts)await writeFile(path.join(directory,font.file),font.bytes,{mode:0o600});
 await readDanfseFonts(profile,root);return {profile};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const result=await prepareDanfseFonts({env:process.env});console.info('DANFS-e font profile: '+result.profile);}
 catch(error){console.error('DANFS-e fonts unavailable: '+(error instanceof DanfseFontError?error.reason:'assets_unavailable'));process.exitCode=1;}
}

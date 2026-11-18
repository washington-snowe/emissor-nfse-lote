import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,access,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {danfseFontProfile,fontEmbeddingOptions,verifyDanfseFont,readDanfseFonts,NT008_FONT_FILES,PRIVATE_DANFSE_FONT_DIRECTORY} from '../src/lib/nfse/danfse-fonts.ts';
import {prepareDanfseFonts} from '../scripts/prepare-danfse-fonts.ts';

const supplied=process.env.DANFSE_FONT_TESTS==='true';
function syntheticSfnt(flags:number){
 const bytes=Buffer.alloc(48);bytes.writeUInt32BE(0x00010000,0);bytes.writeUInt16BE(1,4);bytes.write('OS/2',12,'ascii');bytes.writeUInt32BE(32,20);bytes.writeUInt32BE(10,24);bytes.writeUInt16BE(flags,40);return bytes;
}

test('DANFSe font profile is explicit and never silently falls back from invalid configuration',()=>{
 assert.equal(danfseFontProfile(undefined),'portable');assert.equal(danfseFontProfile('nt008'),'nt008');
 for(const invalid of ['','arial','NT008','nt008 ', 'https://example.com/font.ttf'])assert.throws(()=>danfseFontProfile(invalid),/profile_invalid/);
});

test('font embedding honors OS/2 restrictions and no-subsetting flags',()=>{
 for(const flag of [0,4,8])assert.deepEqual(fontEmbeddingOptions(syntheticSfnt(flag)),{subset:true});
 for(const flag of [0x100,0x104,0x108])assert.deepEqual(fontEmbeddingOptions(syntheticSfnt(flag)),{subset:false});
 for(const flag of [2,6,0x200,0x208,0x8000])assert.throws(()=>fontEmbeddingOptions(syntheticSfnt(flag)),/embedding_restricted/);
 const invalid=syntheticSfnt(8);invalid.writeUInt32BE(1000,20);assert.throws(()=>fontEmbeddingOptions(invalid),/embedding_restricted/);
 assert.throws(()=>fontEmbeddingOptions(Buffer.from('not a TrueType font')),/embedding_restricted/);
});

test('portable assets verify their hashes and cannot impersonate either requested family',async()=>{
 const fonts=await readDanfseFonts('portable');assert.equal(fonts.profile,'portable');
 for(const role of ['labels','values'] as const){assert.equal(fonts[role].subset,true);assert.throws(()=>verifyDanfseFont(fonts[role].bytes,'nt008',role),/integrity_failed/);}
 const dir=await mkdtemp(path.join(tmpdir(),'rex-missing-fonts-'));
 try{await assert.rejects(readDanfseFonts('nt008',dir),/assets_unavailable/);}finally{await rm(dir,{recursive:true,force:true});}
});

test('portable build never reads a private bucket or contacts a service',async()=>{
 let called=false;const result=await prepareDanfseFonts({env:{},storage:{getBucket:async()=>{called=true;throw new Error('Unexpected network');},download:async()=>{throw new Error('Unexpected download');}}});
 assert.equal(result.profile,'portable');assert.equal(called,false);
});

test('private build refuses a public bucket before downloading either font',async()=>{
 let downloaded=false;await assert.rejects(prepareDanfseFonts({env:{DANFSE_FONT_PROFILE:'nt008'},storage:{getBucket:async()=>({private:false}),download:async()=>{downloaded=true;return new Uint8Array();}}}),/assets_unavailable/);assert.equal(downloaded,false);
});

test('private build verifies bytes before materializing any asset',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rex-invalid-fonts-'));let downloads=0;
 try{
  await assert.rejects(prepareDanfseFonts({root,env:{DANFSE_FONT_PROFILE:'nt008'},storage:{getBucket:async()=>({private:true}),download:async()=>{downloads++;return Buffer.alloc(200);}}}),/integrity_failed/);
  assert.equal(downloads,1);await assert.rejects(access(path.join(root,PRIVATE_DANFSE_FONT_DIRECTORY)));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('font build errors expose only a fixed category, never credentials or raw errors',()=>{
 try{execFileSync(process.execPath,['--experimental-strip-types','scripts/prepare-danfse-fonts.ts'],{env:{...process.env,DANFSE_FONT_PROFILE:'invalid',SUPABASE_SERVICE_ROLE_KEY:'SYNTHETIC_PRIVATE_KEY_DO_NOT_LOG'},stdio:'pipe'});assert.fail('invalid profile should stop build');}
 catch(error){const result=error as {status?:number;stderr?:Buffer};assert.equal(result.status,1);const text=result.stderr!.toString();assert.match(text,/DANFS-e fonts unavailable: profile_invalid/);assert.ok(!text.includes('SYNTHETIC_PRIVATE_KEY'));assert.ok(!text.includes('/workspace'));}
});

test('operator-supplied real families validate and prepare sequentially through a private storage boundary',{skip:!supplied},async()=>{
 const fonts=await readDanfseFonts('nt008');assert.equal(fonts.labels.subset,true);assert.equal(fonts.values.subset,true);
 const root=await mkdtemp(path.join(tmpdir(),'rex-private-font-build-')),calls:string[]=[];
 try{
  const result=await prepareDanfseFonts({root,env:{DANFSE_FONT_PROFILE:'nt008'},storage:{getBucket:async()=>({private:true}),download:async(file)=>{calls.push(file);return readFile(path.join(PRIVATE_DANFSE_FONT_DIRECTORY,file));}}});
  assert.equal(result.profile,'nt008');assert.deepEqual(calls,NT008_FONT_FILES.map(f=>f.file));
  const prepared=await readDanfseFonts('nt008',root);assert.ok(prepared.labels.bytes.equals(fonts.labels.bytes));assert.ok(prepared.values.bytes.equals(fonts.values.bytes));
 }finally{await rm(root,{recursive:true,force:true});}
});

test('an invalid second private file leaves no partial font installation',{skip:!supplied},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rex-partial-font-build-'));
 try{
  await assert.rejects(prepareDanfseFonts({root,env:{DANFSE_FONT_PROFILE:'nt008'},storage:{getBucket:async()=>({private:true}),download:async(file)=>file==='arialbd.ttf'?readFile(path.join(PRIVATE_DANFSE_FONT_DIRECTORY,file)):Buffer.alloc(200)}}),/integrity_failed/);
  await assert.rejects(access(path.join(root,PRIVATE_DANFSE_FONT_DIRECTORY)));
 }finally{await rm(root,{recursive:true,force:true});}
});


test('font CLI reads local Next environment configuration before selecting the profile',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'rex-font-env-'));
 try{
  await writeFile(path.join(root,'.env.local'),'DANFSE_FONT_PROFILE=invalid\n');
  const env:NodeJS.ProcessEnv={...process.env,NODE_ENV:'production'};delete env.DANFSE_FONT_PROFILE;
  try{execFileSync(process.execPath,['--experimental-strip-types',path.resolve('scripts/prepare-danfse-fonts.ts')],{cwd:root,env,stdio:'pipe'});assert.fail('local invalid font profile must stop build');}
  catch(error){const result=error as {status?:number;stderr?:Buffer};assert.equal(result.status,1);assert.match(result.stderr!.toString(),/DANFS-e fonts unavailable: profile_invalid/);}
 }finally{await rm(root,{recursive:true,force:true});}
});

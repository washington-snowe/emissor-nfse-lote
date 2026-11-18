import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import fontkit from '@pdf-lib/fontkit';

export type DanfseFontProfile='portable'|'nt008';
export type DanfseFontRole='labels'|'values';
export type DanfseFontAsset={bytes:Buffer;subset:boolean};
export type DanfseFonts={profile:DanfseFontProfile;labels:DanfseFontAsset;values:DanfseFontAsset};
export const PRIVATE_DANFSE_FONT_BUCKET='danfse-fonts';
export const PRIVATE_DANFSE_FONT_DIRECTORY='.private/danfse-fonts';
export const NT008_FONT_FILES=[
 {file:'arialbd.ttf',role:'labels',family:'Arial',style:'Bold',postscript:'Arial-BoldMT',sha256:'766f06ac8761f82f25d032a220e89438f6064591af9915061f20b949efdedf69'},
 {file:'micross.ttf',role:'values',family:'Microsoft Sans Serif',style:'Regular',postscript:'MicrosoftSansSerif',sha256:'fc5744108eb6112844be3ec63c0fd76fe0eb782aea25c6aaa58c151d8dc19055'},
] as const;
const portable=[
 {file:'LiberationSans-Bold.ttf',role:'labels',family:'Liberation Sans',style:'Bold',postscript:'LiberationSans-Bold',sha256:'1b5f2da6f4cadce4c05b9ecebe3a6fcd374eb95ae443605e799f4c3287978939'},
 {file:'LiberationSans-Regular.ttf',role:'values',family:'Liberation Sans',style:'Regular',postscript:'LiberationSans',sha256:'bade59d822652f76e6941aa87b40a87c13d1cc70db98ededb5011127efafd1d3'},
] as const;
export const MAX_DANFSE_FONT_BYTES=2_000_000;
type FontFailure='profile_invalid'|'assets_unavailable'|'integrity_failed'|'font_identity_mismatch'|'embedding_restricted';
export class DanfseFontError extends Error{
 readonly reason:FontFailure;
 constructor(reason:FontFailure){super('DANFSe font '+reason);this.reason=reason;}
}
export function danfseFontProfile(value:string|undefined):DanfseFontProfile{
 if(value===undefined||value==='portable')return 'portable';if(value==='nt008')return 'nt008';throw new DanfseFontError('profile_invalid');
}
/** Font OS/2 embedding flags are technical restrictions, not proof of a server licence. */
export function fontEmbeddingOptions(bytes:Buffer){
 if(bytes.length<12||bytes.readUInt32BE(0)!==0x00010000)throw new DanfseFontError('embedding_restricted');
 const count=bytes.readUInt16BE(4);if(count<1||count>100||12+count*16>bytes.length)throw new DanfseFontError('embedding_restricted');
 let flags:number|undefined;
 for(let i=0;i<count;i++){
  const pos=12+i*16;if(bytes.toString('ascii',pos,pos+4)!=='OS/2')continue;
  if(flags!==undefined)throw new DanfseFontError('embedding_restricted');
  const offset=bytes.readUInt32BE(pos+8),length=bytes.readUInt32BE(pos+12);
  if(length<10||offset<12+count*16||offset+length>bytes.length)throw new DanfseFontError('embedding_restricted');flags=bytes.readUInt16BE(offset+8);
 }
 if(flags===undefined||(flags&~0x030e)!==0||(flags&0x0002)!==0||(flags&0x0200)!==0)throw new DanfseFontError('embedding_restricted');
 return {subset:(flags&0x0100)===0};
}
export function verifyDanfseFont(bytes:Buffer,profile:DanfseFontProfile,role:DanfseFontRole):DanfseFontAsset{
 const spec=(profile==='nt008'?NT008_FONT_FILES:portable).find(item=>item.role===role);
 if(!spec||bytes.length<100||bytes.length>MAX_DANFSE_FONT_BYTES||createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw new DanfseFontError('integrity_failed');
 const font=fontkit.create(bytes);
 if(font.familyName!==spec.family||font.subfamilyName!==spec.style||font.postscriptName!==spec.postscript)throw new DanfseFontError('font_identity_mismatch');
 return {bytes,...fontEmbeddingOptions(bytes)};
}
/** Fixed server paths only; no file, path, family or URL comes from a PDF request. */
export async function readDanfseFonts(profile:DanfseFontProfile,root=process.cwd()):Promise<DanfseFonts>{
 const directory=path.join(root,profile==='nt008'?PRIVATE_DANFSE_FONT_DIRECTORY:'integrations/nfse/danfse/assets');
 const assets={} as Record<DanfseFontRole,DanfseFontAsset>;
 for(const spec of profile==='nt008'?NT008_FONT_FILES:portable){
  let bytes:Buffer;try{bytes=await readFile(path.join(directory,spec.file));}catch{throw new DanfseFontError('assets_unavailable');}
  assets[spec.role]=verifyDanfseFont(bytes,profile,spec.role);
 }
 return {profile,...assets};
}
let cached:{profile:DanfseFontProfile;fonts:Promise<DanfseFonts>}|undefined;
export function loadDanfseFonts(){
 const profile=danfseFontProfile(process.env.DANFSE_FONT_PROFILE);
 if(!cached||cached.profile!==profile)cached={profile,fonts:readDanfseFonts(profile).catch(error=>{cached=undefined;throw error;})};
 return cached.fonts;
}
export function danfseTypographyLabel(profile:DanfseFontProfile){
 return profile==='nt008'?'Arial Bold nos títulos; Microsoft Sans Serif nos conteúdos.':'Liberation Sans · fonte equivalente; tipografia da NT não aplicada integralmente.';
}

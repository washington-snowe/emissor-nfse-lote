import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {PDFDocument,PDFName,PDFString,cmyk,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import {buildDanfseModel,DANFSE_RENDERER_VERSION,type DanfseField,type Municipalities,type DanfseModel} from './danfse-model.ts';
import type {NfseEnvironment} from './http.ts';
import {validDanfsePdf} from './danfse.ts';
import {loadDanfseFonts} from './danfse-fonts.ts';

const assets={
 'nfse-horizontal.png':'ab57fa34887929a10ee3b9b4d666084ec9b9465e62bbcc3523b99b23ccac1063',
 'municipalities.json':'66b757c303712e7534527eb69e025ac716b86bfe7f534777efaa2d4f02e00a4e',
} as const;
type Assets={logo:Buffer;places:Municipalities};
let publicAssets:Promise<Assets>|undefined;
function loadAssets(){
 return publicAssets??=(async()=>{
  const values:Buffer[]=[];
  for(const [name,hash] of Object.entries(assets)){
   const bytes=await readFile(path.join(process.cwd(),'integrations/nfse/danfse/assets',name));
   if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('DANFSe assets unavailable');values.push(bytes);
  }
  return {logo:values[0],places:JSON.parse(values[1].toString('utf8')) as Municipalities};
 })().catch(error=>{publicAssets=undefined;throw error;});
}
const cm=(value:number)=>value*72/2.54;
const width=cm(21),height=cm(29.7),left=cm(.30),bodyWidth=cm(20.4),rowHeight=cm(.67),ink=cmyk(0,0,0,1),paper=cmyk(0,0,0,0),shade=cmyk(0,0,0,.05),red=cmyk(0,1,1,0);
function printable(font:PDFFont,value:string){
 const supported=new Set(font.getCharacterSet());
 for(const character of value)if(!supported.has(character.codePointAt(0)!))throw new Error('DANFSe unsupported character');
}
function fit(font:PDFFont,value:string,size:number,maxWidth:number,exact=false){
 printable(font,value);if(font.widthOfTextAtSize(value,size)<=maxWidth)return value;
 if(exact)throw new Error('DANFSe field overflow');
 let result=value;while(result&&font.widthOfTextAtSize(result+'...',size)>maxWidth)result=result.slice(0,-1);return result+'...';
}
function wrap(font:PDFFont,value:string,size:number,maxWidth:number){
 printable(font,value);const lines:string[]=[];
 for(const paragraph of value.split('\n')){
  let line='';for(const word of paragraph.split(/\s+/)){
   if(!word)continue;
   if(font.widthOfTextAtSize(word,size)>maxWidth){
    if(line){lines.push(line);line='';}
    let part='';for(const character of word){if(part&&font.widthOfTextAtSize(part+character,size)>maxWidth){lines.push(part);part='';}part+=character;}line=part;
   }else if(line&&font.widthOfTextAtSize(line+' '+word,size)>maxWidth){lines.push(line);line=word;}else line+=(line?' ':'')+word;
  }
  lines.push(line);
 }
 return lines;
}
async function documentFonts(){
 const source=await loadAssets(),pdf=await PDFDocument.create({updateMetadata:false});pdf.registerFontkit(fontkit);
 const fonts=await loadDanfseFonts();
 const normal=await pdf.embedFont(fonts.values.bytes,{subset:fonts.values.subset}),bold=await pdf.embedFont(fonts.labels.bytes,{subset:fonts.labels.subset});
 return {pdf,normal,bold,source,typography:fonts.profile};
}

/** No fiscal communication, external resources, HTML, uploaded PDF or A1. */
export async function assertLocalDanfseReady(){
 const {pdf,normal,bold,typography}=await documentFonts(),page=pdf.addPage([width,height]);
 const message='TESTE LOCAL DO GERADOR – NÃO É NFS-e';printable(normal,message);page.drawText(message,{x:20,y:height-30,font:normal,size:7});
 page.drawText('DANFSe v2.0',{x:20,y:height-50,font:bold,size:9});
 const code=QRCode.create('https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave='+'0'.repeat(50),{errorCorrectionLevel:'M'});
 if(code.modules.size<21)throw new Error('DANFSe QR unavailable');
 const bytes=Buffer.from(await pdf.save({useObjectStreams:false}));if(!validDanfsePdf(bytes))throw new Error('DANFSe renderer unavailable');
 return {version:DANFSE_RENDERER_VERSION,typography};
}

export async function renderLocalDanfse(xml:string,expected:{accessKey:string;issuerCnpj:string;environment:NfseEnvironment}){
 const {pdf,normal,bold,source,typography}=await documentFonts(),model=buildDanfseModel(xml,expected,source.places);
 const page=pdf.addPage([width,height]);
 const draw=(text:string,x:number,top:number,size=7,font=normal,color=ink)=>{
  printable(font,text);page.drawText(text,{x,y:height-top-size,font,size,color});
 };
 const box=(x:number,top:number,w:number,h:number,filled=false,lineWidth=.5)=>page.drawRectangle({x,y:height-top-h,width:w,height:h,borderColor:ink,borderWidth:lineWidth,color:filled?shade:paper});
 const lineText=(value:string,x:number,top:number,w:number,size:number,font:PDFFont,exact=false)=>draw(fit(font,value,size,w,exact),x,top,size,font);
 const row=(fields:DanfseField[],top:number,w=bodyWidth,cols=4,identification=false)=>{
  if(fields.reduce((n,f)=>n+(f.span??1),0)!==cols)throw new Error('DANFSe invalid layout');let x=left;
  for(const f of fields){
   const cell=w*(f.span??1)/cols;box(x,top,cell,rowHeight,Boolean(f.title||f.emphasis));
   if(f.title){lineText(f.label,x+2,top+5,cell-4,7,bold);}
   else{
    lineText(f.label,x+2,top+1.1,cell-4,identification?7:6,bold);
    lineText(f.value,x+2,top+9.4,cell-4,7,normal,f.exact);
   }
   x+=cell;
  }
 };
 const textBlock=(label:string,value:string,top:number,h:number,fixedTail='')=>{
  box(left,top,bodyWidth,cm(.32),true);draw(label,left+2,top+1.3,7,bold);
  box(left,top+cm(.32),bodyWidth,h-cm(.32));
  const maxLines=Math.floor((h-cm(.32)-5)/8.2),tail=fixedTail?wrap(normal,fixedTail,7,bodyWidth-6):[];
  if(maxLines<tail.length+1)throw new Error('DANFSe text overflow');
  const lines=wrap(normal,value||'-',7,bodyWidth-6),room=maxLines-tail.length;
  const visible=lines.slice(0,room);if(lines.length>room)visible[visible.length-1]=fit(normal,visible.at(-1)!.replace(/\.{0,3}$/,'')+'...',7,bodyWidth-6);
  [...visible,...tail].forEach((text,i)=>draw(text,left+3,top+cm(.32)+2+i*8.2));
 };
 box(cm(.15),cm(.15),width-cm(.30),height-cm(.30),false,1);
 const headerTop=cm(.30),headerH=cm(1.16),quarter=bodyWidth/4;
 box(left,headerTop,quarter,headerH,true);box(left+quarter,headerTop,quarter*2,headerH,true);box(left+quarter*3,headerTop,quarter,headerH,true);
 const logo=await pdf.embedPng(source.logo),logoWidth=cm(4),logoHeight=logo.height/logo.width*logoWidth;
 if(logoHeight>cm(.9))throw new Error('DANFSe logo unavailable');page.drawImage(logo,{x:cm(.49),y:height-cm(.44)-logoHeight,width:logoWidth,height:logoHeight});
 const center=left+quarter*2;
 const centered=(value:string,top:number,color=ink)=>{printable(bold,value);draw(value,center-bold.widthOfTextAtSize(value,9)/2,top,9,bold,color);};
 centered('DANFSe v2.0',headerTop+2);centered('Documento Auxiliar da NFS-e',headerTop+12);
 if(model.environment==='homologation')centered('NFS-e SEM VALIDADE JURÍDICA',headerTop+22,red);
 lineText('Município: '+model.municipality,left+quarter*3+2,headerTop+2,quarter-4,8,normal);
 lineText('Ambiente Gerador: '+model.generator,left+quarter*3+2,headerTop+15,quarter-4,6,normal);
 draw('Tipo de Ambiente: '+(model.environment==='production'?'Produção':'Homologação'),left+quarter*3+2,headerTop+24,6,normal);
 const identificationTop=cm(1.67);
 model.identification.forEach((fields,i)=>row(fields,identificationTop+i*rowHeight,quarter*3,3,true));
 // QR: vector modules, >=1.52cm symbol excluding four-module quiet zone.
 const code=QRCode.create(model.qrUrl,{errorCorrectionLevel:'M'}),qr=code.modules,qrSize=cm(2),moduleSize=qrSize/(qr.size+8),qx=cm(17.34),qy=cm(1.53);
 if(moduleSize*qr.size<cm(1.52))throw new Error('DANFSe QR below minimum');
 page.drawRectangle({x:qx,y:height-qy-qrSize,width:qrSize,height:qrSize,color:paper});
 for(let r=0;r<qr.size;r++)for(let c=0;c<qr.size;c++)if(qr.get(r,c))page.drawRectangle({x:qx+(c+4)*moduleSize,y:height-qy-(r+5)*moduleSize,width:moduleSize,height:moduleSize,color:ink});
 const annotation=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[qx,height-qy-qrSize,qx+qrSize,height-qy],Border:[0,0,0],A:{Type:'Action',S:PDFName.of('URI'),URI:PDFString.of(model.qrUrl)}});
 page.node.addAnnot(pdf.context.register(annotation));
 ['A autenticidade desta NFS-e pode ser verificada','pela leitura deste código QR ou pela consulta da','chave de acesso no portal nacional da NFS-e'].forEach((line,i)=>lineText(line,cm(15.80),cm(3.55)+i*6.2,cm(4.72),6,normal,true));
 let y=identificationTop+model.identification.length*rowHeight;
 for(const section of model.sections){
  if(section.message){box(left,y,bodyWidth,cm(.32),true);lineText(section.message,left+2,y+1.2,bodyWidth-4,7,bold,true);y+=cm(.32);continue;}
  for(const fields of section.rows){row(fields,y);y+=rowHeight;}
  if(section.title==='SERVIÇO PRESTADO'){
   const lines=wrap(normal,model.description,7,bodyWidth-6),blockHeight=Math.max(cm(1.0),Math.min(cm(4.5),cm(.32)+6+lines.length*8.2));
   textBlock('Descrição do Serviço',model.description,y,blockHeight);y+=blockHeight;
  }
 }
 const bottom=cm(29.40),remaining=bottom-y;if(remaining<cm(1.2))throw new Error('DANFSe page overflow');
 const split=model.complement.lastIndexOf('Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012:');
 if(split<0)throw new Error('DANFSe tax caption unavailable');
 textBlock('INFORMAÇÕES COMPLEMENTARES',model.complement.slice(0,split).trim(),y,remaining,model.complement.slice(split));
 const issued=new Date(model.processed);if(!Number.isFinite(issued.getTime()))throw new Error('DANFSe date unavailable');
 pdf.setTitle('DANFSe '+model.number);pdf.setAuthor('');pdf.setCreator('RexNotas');pdf.setProducer('RexNotas – '+DANFSE_RENDERER_VERSION);pdf.setCreationDate(issued);pdf.setModificationDate(issued);
 pdf.setSubject('Representação auxiliar do XML autorizado; origem: geração local RexNotas.');
 const bytes=Buffer.from(await pdf.save({useObjectStreams:false}));if(!validDanfsePdf(bytes))throw new Error('DANFSe PDF invalid');
 return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),model,typography};
}

export type {DanfseModel};

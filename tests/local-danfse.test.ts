import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {PDFDocument} from 'pdf-lib';
import jsQR from 'jsqr';
import {identity,signedDps,nfseFixture} from './helpers/fiscal-fixture.ts';
import {buildDanfseModel,formatDanfseMoney} from '../src/lib/nfse/danfse-model.ts';
import {assertLocalDanfseReady,renderLocalDanfse} from '../src/lib/nfse/danfse-render.ts';
import {validDanfsePdf} from '../src/lib/nfse/danfse.ts';

// Public synthetic keys/identities only; no official authorization evidence.
const key='1'.repeat(50),holder=identity(),service=identity(),places=JSON.parse(await readFile('integrations/nfse/danfse/assets/municipalities.json','utf8'));
const expected={accessKey:key,issuerCnpj:'11222333000181',environment:'homologation' as const};
const signed=signedDps(holder),xml=nfseFixture(signed.xml,service);
const cells=(source:string)=>buildDanfseModel(source,expected,places).sections.flatMap(s=>s.rows.flat());
const value=(source:string,label:string)=>cells(source).find(f=>f.label===label)!.value;

test('local DANFSe preserves authorized fields, actual offset, absent taxes and integer monetary precision',()=>{
 const model=buildDanfseModel(xml,expected,places);
 assert.equal(model.identification[0][0].value,key);assert.equal(model.identification[1][1].value,'31/10/2026');
 assert.match(model.identification[2][2].value,/12:00:00 \+00:00$/);assert.equal(model.identification[3][1].value,'NFS-e MEI');
 assert.equal(model.generator,'Sistema Nacional da NFS-e');
 assert.equal(value(xml,'Município / Sigla UF'),'São Paulo / SP');assert.equal(value(xml,'Valor Líquido da NFS-e'),'R$ 11,01');
 for(const label of ['ISSQN Apurado','IRRF','Base de Cálculo Após Exclusões e Reduções','Valor Total Apurado – CBS'])assert.equal(value(xml,label),'-');
 assert.equal(formatDanfseMoney('999999999999999.99'),'R$ 999.999.999.999.999,99');assert.equal(formatDanfseMoney('0.00'),'R$ 0,00');assert.equal(formatDanfseMoney(null),'-');
 for(const v of ['NaN','-1','1.001','1e3','1,00'])assert.throws(()=>formatDanfseMoney(v));
 assert.equal(model.qrUrl,'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave='+key);
 assert.match(model.complement,/Totais Aproximados dos Tributos cfe. Lei nº 12.741\/2012/);
});

test('local projection rejects ambiguous XML, foreign identity/environment and unapproved status',()=>{
 for(const changed of [xml.replace('versao="1.01"','versao="9.99"'),xml.replace('NFS'+key,'NFS'+'2'.repeat(50)),xml.replace('<tpAmb>2</tpAmb>','<tpAmb>1</tpAmb>'),xml.replace('<cStat>107</cStat>','<cStat>101</cStat>'),xml.replace('<vLiq>11.01</vLiq>','<vLiq>11.01</vLiq><vLiq>99.00</vLiq>'),xml.replace('<CNPJ>11222333000181</CNPJ>','<CNPJ>11444777000161</CNPJ>'),'<!DOCTYPE NFSe [<!ENTITY x "bad">]>'+xml])assert.throws(()=>buildDanfseModel(changed,expected,places));
});

test('NT008 PIS/COFINS retained totals and displayed zero derive only from explicit retention type',()=>{
 const source=xml.replace('</tribMun>','</tribMun><tribFed><piscofins><vPis>1.01</vPis><vCofins>2.02</vCofins><tpRetPisCofins>1</tpRetPisCofins></piscofins><vRetCSLL>3.03</vRetCSLL></tribFed>');
 assert.equal(value(source,'Contribuições Sociais – Retidas'),'R$ 6,06');assert.equal(value(source,'PIS – Débito Apuração Própria'),'R$ 0,00');
 const unretained=source.replace('<tpRetPisCofins>1','<tpRetPisCofins>2');assert.equal(value(unretained,'Contribuições Sociais – Retidas'),'R$ 3,03');assert.equal(value(unretained,'PIS – Débito Apuração Própria'),'R$ 1,01');
});

test('generated DANFSe is single-page A4, keeps key/amounts and yields a readable national QR from the PDF',async()=>{
 assert.equal((await assertLocalDanfseReady()).version,'nt008-1.02-rex-v1');
 const result=await renderLocalDanfse(xml,expected);assert.ok(validDanfsePdf(result.bytes));
 const pdf=await PDFDocument.load(result.bytes),page=pdf.getPages()[0];assert.equal(pdf.getPageCount(),1);assert.ok(Math.abs(page.getWidth()-595.276)<.01);assert.ok(Math.abs(page.getHeight()-841.89)<.01);
 const dir=await mkdtemp(path.join(tmpdir(),'rex-synthetic-danfse-'));
 try{
  const file=path.join(dir,'test.pdf');await writeFile(file,result.bytes);
  const text=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8'});
  if(result.typography==='nt008'){const names=execFileSync('pdffonts',[file],{encoding:'utf8'});assert.match(names,/Arial-BoldMT/);assert.match(names,/MicrosoftSansSerif/);assert.ok(!names.includes('LiberationSans'));}
  for(const part of [key,'NFS-e SEM VALIDADE JURÍDICA','R$ 11,01','TRIBUTAÇÃO IBS / CBS','Totais Aproximados dos Tributos'])assert.ok(text.includes(part),part);
  execFileSync('pdftoppm',['-r','300','-singlefile','-png',file,path.join(dir,'qr')]);
  const require=createRequire(import.meta.url),{PNG}=require('pngjs'),image=PNG.sync.read(await readFile(path.join(dir,'qr.png')));
  const decoded=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);assert.ok(decoded,'actual vector QR should decode after rasterizing the PDF');assert.equal(decoded.data,result.model.qrUrl);
  const production=signedDps(holder,'production'),prod=await renderLocalDanfse(nfseFixture(production.xml,service),{...expected,environment:'production'});
  await writeFile(file,prod.bytes);assert.ok(!execFileSync('pdftotext',[file,'-'],{encoding:'utf8'}).includes('SEM VALIDADE JURÍDICA'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('long service and complementary fields stay within one page; fixed tax legend remains present',async()=>{
 // Projection/layout stress only: replacing fields intentionally invalidates fixture signatures.
 const long=xml.replace('Synthetic fiscal fixture','Descrição longa de serviço de teste. '.repeat(55)).replace('</cServ>','</cServ><infoCompl><xInfComp>'+('Informação complementar. '.repeat(75))+'</xInfComp></infoCompl>');
 const result=await renderLocalDanfse(long,expected);assert.equal((await PDFDocument.load(result.bytes)).getPageCount(),1);
 const dir=await mkdtemp(path.join(tmpdir(),'rex-synthetic-long-'));
 try{const file=path.join(dir,'long.pdf');await writeFile(file,result.bytes);const text=execFileSync('pdftotext',[file,'-'],{encoding:'utf8'});assert.match(text,/Lei nº 12.741\/2012/);assert.match(text,/INFORMAÇÕES COMPLEMENTARES/);}finally{await rm(dir,{recursive:true,force:true});}
});

test('full destination/intermediary blocks and maximum service height still fit A4',async()=>{
 const person='<CNPJ>11444777000161</CNPJ><xNome>Destinatário sintético</xNome>';
 const long=xml.replace('Synthetic fiscal fixture','Serviço de teste com descrição longa. '.repeat(55)).replace('</toma>','</toma><interm>'+person+'</interm>').replace('</infDPS>','<IBSCBS><dest>'+person+'</dest></IBSCBS></infDPS>');
 const result=await renderLocalDanfse(long,expected);
 assert.equal((await PDFDocument.load(result.bytes)).getPageCount(),1);
 assert.ok(result.model.sections.filter(section=>['DESTINATÁRIO DA OPERAÇÃO','INTERMEDIÁRIO DA OPERAÇÃO'].includes(section.title)).every(section=>section.rows.length===3));
});

test('unavailable glyphs block generation instead of silently damaging recipient/service text',async()=>{
 await assert.rejects(renderLocalDanfse(xml.replace('Synthetic fiscal fixture','Serviço 🦖 de teste'),expected),/unsupported character/);
});

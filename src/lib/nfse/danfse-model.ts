import type {Element} from '@xmldom/xmldom';
import {parseFiscalXml,directElements,singleElement} from './xml.ts';
import {NFSE_NAMESPACE as NS} from './dps.ts';
import type {NfseEnvironment} from './http.ts';

export type DanfseField={label:string;value:string;span?:number;title?:boolean;emphasis?:boolean;exact?:boolean};
export type DanfseSection={title:string;rows:DanfseField[][];message?:string};
export type DanfseModel={environment:NfseEnvironment;accessKey:string;number:string;processed:string;municipality:string;generator:string;identification:DanfseField[][];sections:DanfseSection[];description:string;complement:string;qrUrl:string};
export type Municipalities=Record<string,[string,string]>;
export const DANFSE_SPEC_SHA256='1265f403aedcdc5f08b3049dcc18a15c2bc155f51afccf3d12690fef2f4fb0ff';
export const DANFSE_RENDERER_VERSION='nt008-1.02-rex-v1';

function node(root:Element|null,path:string):Element|null{
 let current=root;
 for(const part of path.split('/')){
  if(!current)return null;const found=directElements(current,NS,part);
  if(found.length>1)throw new Error('DANFSe ambiguous XML');current=found[0]??null;
 }
 return current;
}
const text=(root:Element|null,path:string)=>node(root,path)?.textContent?.trim()||null;
const joined=(values:(string|null|undefined)[],separator=' / ')=>values.filter((v):v is string=>Boolean(v)).join(separator)||'-';
const label=(value:string|null,labels:Record<string,string>)=>value===null?'-':labels[value]??value;
const clean=(value:string)=>value.normalize('NFC').replace(/\s+/g,' ').trim();
export function moneyCents(value:string):bigint{
 if(!/^\d{1,15}(?:\.\d{1,2})?$/.test(value))throw new Error('DANFSe invalid monetary field');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
export function formatDanfseMoney(value:string|null):string{
 if(value===null)return '-';const cents=moneyCents(value),whole=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');return 'R$ '+whole+','+(cents%100n).toString().padStart(2,'0');
}
function sum(values:(string|null)[]):string|null{
 const present=values.filter((v):v is string=>v!==null);if(!present.length)return null;
 const total=present.reduce((n,v)=>n+moneyCents(v),0n);return (total/100n).toString()+'.'+(total%100n).toString().padStart(2,'0');
}
function percent(value:string|null){if(value===null)return '-';if(!/^\d{1,3}(?:\.\d{1,4})?$/.test(value))throw new Error('DANFSe invalid percentage');return value.replace('.',',')+'%';}
function date(value:string|null){if(!value)return '-';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z')))throw new Error('DANFSe invalid date');return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);}
function timestamp(value:string|null){if(!value)return '-';const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);if(!m||!Number.isFinite(Date.parse(value)))throw new Error('DANFSe invalid timestamp');return date(m[1])+' '+m[2]+' '+(m[3]==='Z'?'UTC':m[3]);}
function document(value:string|null){if(!value)return '-';return /^\d{14}$/.test(value)?value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):/^\d{11}$/.test(value)?value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4'):value;}
const field=(label:string,value:string|null,span=1,exact=false):DanfseField=>({label,value:value===null?'-':clean(value),span,exact});
const title=(value:string):DanfseField=>({label:value,value:'',span:1,title:true});
const cash=(label:string,value:string|null):DanfseField=>field(label,formatDanfseMoney(value),1,true);
const pct=(label:string,value:string|null):DanfseField=>field(label,percent(value),1,true);

/** Projection only, after the server has verified the stored authorized XML,
 * original DPS, hashes and signatures. No user XML/URL can call the HTTP route.
 * Missing XML values stay '-', including taxes; no fiscal settings are inferred.
 */
export function buildDanfseModel(xml:string,expected:{accessKey:string;issuerCnpj:string;environment:NfseEnvironment},places:Municipalities):DanfseModel{
 const doc=parseFiscalXml(xml),root=doc.documentElement!;
 if(root.localName!=='NFSe'||root.namespaceURI!==NS||root.getAttribute('versao')!=='1.01'||!/^\d{50}$/.test(expected.accessKey)||!['production','homologation'].includes(expected.environment))throw new Error('DANFSe invalid source');
 const info=singleElement(root,NS,'infNFSe'),dps=singleElement(singleElement(info,NS,'DPS'),NS,'infDPS'),emit=singleElement(info,NS,'emit');
 if(info.getAttribute('Id')!=='NFS'+expected.accessKey||text(emit,'CNPJ')!==expected.issuerCnpj||text(dps,'prest/CNPJ')!==expected.issuerCnpj||text(dps,'tpAmb')!==(expected.environment==='production'?'1':'2')||!['100','107'].includes(text(info,'cStat')??''))throw new Error('DANFSe source mismatch');
 const p=(path:string)=>text(dps,path),n=(path:string)=>text(info,path);
 const place=(code:string|null,fallback:string|null=null,uf:string|null=null)=>code&&places[code]?places[code].join(' / '):joined([fallback,uf]);
 const parts=(part:Element|null,fallback:Element|null=null)=>{
  const v=(path:string)=>text(part,path)??text(fallback,path);
  const address=node(part,'end')??node(fallback,'enderNac'),national=node(address,'endNac')??(address?.localName==='enderNac'?address:null),foreign=node(address,'endExt');
  const code=text(national,'cMun'),postal=text(national,'CEP')??text(foreign,'cEndPost');
  return {id:document(v('CNPJ')??v('CPF')??v('NIF')),im:v('IM'),phone:v('fone'),name:v('xNome'),city:place(code,text(foreign,'xCidade'),text(foreign,'xEstProvReg')??text(national,'UF')),
   codePostal:joined([code,postal?.replace(/^(\d{5})(\d{3})$/,'$1-$2')]),address:joined([text(address,'xLgr'),text(address,'nro'),text(address,'xCpl'),text(address,'xBairro')],', '),email:v('email')};
 };
 const party=(name:string,part:Element|null,fallback:Element|null=null):DanfseSection=>{
  if(!part&&!fallback)return {title:name,rows:[],message:name==='TOMADOR / ADQUIRENTE'?'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e':name==='DESTINATÁRIO DA OPERAÇÃO'?'DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e':'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e'};
  const a=parts(part,fallback);
  return {title:name,rows:[
   [title(name),field('CNPJ / CPF / NIF',a.id,1,true),field('Inscrição Municipal',a.im),field('Telefone',a.phone)],
   [field('Nome / Nome Empresarial',a.name,2),field('Município / Sigla UF',a.city),field('Código IBGE / CEP',a.codePostal)],
   [field('Endereço',a.address,2),field('E-mail',a.email,2)],
  ]};
 };
 const issuer=party('PRESTADOR / FORNECEDOR',node(dps,'prest'),emit);
 issuer.rows.push([field('Simples Nacional na Data de Competência',label(p('prest/regTrib/opSimpNac'),{'1':'Não Optante','2':'Optante – Microempreendedor Individual (MEI)','3':'Optante – Microempresa ou Empresa de Pequeno Porte (ME/EPP)'}),2),field('Regime de Apuração Tributária pelo SN',label(p('prest/regTrib/regApTribSN'),{'1':'Tributos federais e municipal pelo SN','2':'Tributos federais pelo SN e ISSQN por fora do SN','3':'Tributos federais e municipal por fora do SN'}),2)]);
 const service:DanfseSection={title:'SERVIÇO PRESTADO',rows:[
  [title('SERVIÇO PRESTADO'),field('Código de Tributação Nacional',p('serv/cServ/cTribNac')),field('Código de Tributação Municipal',p('serv/cServ/cTribMun')),field('Código da NBS',p('serv/cServ/cNBS'))],
  [field('Local da Prestação / Sigla UF / País',place(p('serv/locPrest/cLocPrestacao'),n('xLocPrestacao'),p('serv/locPrest/cPaisPrestacao')),2),field('Descrição do Código de Tributação Nacional / Municipal',joined([n('xTribNac'),n('xTribMun')],' / '),2)],
 ]};
 const iss:DanfseSection={title:'TRIBUTAÇÃO MUNICIPAL (ISSQN)',rows:[
  [title('TRIBUTAÇÃO MUNICIPAL (ISSQN)'),field('Tipo de Tributação do ISSQN',label(p('valores/trib/tribMun/tribISSQN'),{'1':'Operação Tributável','2':'Imunidade','3':'Exportação de Serviço','4':'Não Incidência'})),field('Município / Sigla UF / País de Incidência do ISSQN',place(n('cLocIncid'),n('xLocIncid')),2)],
  [field('Regime Especial de Tributação',label(p('prest/regTrib/regEspTrib'),{'0':'Nenhum','1':'Ato Cooperado','2':'Estimativa','3':'Microempresa Municipal','4':'Notário ou Registrador','5':'Profissional Autônomo','6':'Sociedade de Profissionais'})),field('Tipo de Imunidade',p('valores/trib/tribMun/tpImunidade')),field('Suspensão da Exigibilidade',label(p('valores/trib/tribMun/exigSusp/tpSusp'),{'1':'Decisão Judicial','2':'Processo Administrativo'})),field('Número Processo Suspensão',p('valores/trib/tribMun/exigSusp/nProcesso'))],
  [field('Benefício Municipal',p('valores/trib/tribMun/BM/nBM')),cash('Cálculo do Benefício Municipal',n('valores/vCalcBM')??p('valores/trib/tribMun/BM/vRedBCBM')),cash('Total Deduções / Reduções',sum([p('valores/vDedRed/vDR')??n('valores/vCalcDR'),n('IBSCBS/valores/vCalcReeRepRes')])),cash('Desconto Incondicionado',p('valores/vDescCondIncond/vDescIncond'))],
  [cash('BC ISSQN',n('valores/vBC')),pct('Alíquota Aplicada',n('valores/pAliqAplic')),field('Retenção do ISSQN',label(p('valores/trib/tribMun/tpRetISSQN'),{'1':'Não Retido','2':'Retido pelo Tomador','3':'Retido pelo Intermediário'})),cash('ISSQN Apurado',n('valores/vISSQN'))],
 ]};
 const pisRetained=p('valores/trib/tribFed/piscofins/tpRetPisCofins')==='1';
 const fed:DanfseSection={title:'TRIBUTAÇÃO FEDERAL (EXCETO CBS)',rows:[
  [title('TRIBUTAÇÃO FEDERAL (EXCETO CBS)'),cash('IRRF',p('valores/trib/tribFed/vRetIRRF')),cash('Contribuição Previdenciária – Retida',p('valores/trib/tribFed/vRetCP')),cash('Contribuições Sociais – Retidas',pisRetained?sum([p('valores/trib/tribFed/vRetCSLL'),p('valores/trib/tribFed/piscofins/vPis'),p('valores/trib/tribFed/piscofins/vCofins')]):p('valores/trib/tribFed/vRetCSLL'))],
 ]};
 if((p('dCompet')??'').slice(0,4)<='2026')fed.rows.push([cash('PIS – Débito Apuração Própria',pisRetained?'0.00':p('valores/trib/tribFed/piscofins/vPis')),cash('COFINS – Débito Apuração Própria',pisRetained?'0.00':p('valores/trib/tribFed/piscofins/vCofins')),field('Descrição das Contribuições Sociais – Retidas',label(p('valores/trib/tribFed/piscofins/tpRetPisCofins'),{'0':'PIS/COFINS/CSLL Não Retidos','1':'PIS/COFINS Retidos','2':'PIS/COFINS Não Retidos','3':'PIS/COFINS/CSLL Retidos','4':'PIS/COFINS Retidos, CSLL Não Retido','5':'PIS Retido, COFINS/CSLL Não Retido','6':'COFINS Retido, PIS/CSLL Não Retido','7':'PIS Não Retido, COFINS/CSLL Retidos','8':'PIS/COFINS Não Retidos, CSLL Retido','9':'COFINS Não Retido, PIS/CSLL Retidos'}),2)]);
 const ibsValue=n('IBSCBS/totCIBS/gIBS/vIBSTot'),cbsValue=n('IBSCBS/totCIBS/gCBS/vCBS');
 const ibs:DanfseSection={title:'TRIBUTAÇÃO IBS / CBS',rows:[
  [title('TRIBUTAÇÃO IBS / CBS'),field('CST / cClassTrib',joined([p('IBSCBS/valores/trib/gIBSCBS/CST'),p('IBSCBS/valores/trib/gIBSCBS/cClassTrib')])),field('Indicador de Operação / IBGE / Município Incidência / UF',joined([p('IBSCBS/cIndOp'),n('IBSCBS/cLocalidadeIncid'),place(n('IBSCBS/cLocalidadeIncid'),n('IBSCBS/xLocalidadeIncid'))]),2)],
  [cash('Exclusões e Reduções da Base de Cálculo',node(info,'IBSCBS')?sum([p('valores/vDescCondIncond/vDescIncond'),n('IBSCBS/valores/vCalcReeRepRes'),n('IBSCBS/valores/vCalcAjusteBCIBSCBS'),n('IBSCBS/valores/vCalcAjusteBCLocImoveis'),n('valores/vISSQN'),p('valores/trib/tribFed/piscofins/vPis'),p('valores/trib/tribFed/piscofins/vCofins')]):null),cash('Base de Cálculo Após Exclusões e Reduções',n('IBSCBS/valores/vBC')),field('Redução de Alíquota IBS UF / IBS Mun / CBS',joined([percent(n('IBSCBS/valores/uf/pRedAliqUF')),percent(n('IBSCBS/valores/mun/pRedAliqMun')),percent(n('IBSCBS/valores/fed/pRedAliqCBS'))])),field('Alíquota IBS UF / IBS Municipal',joined([percent(n('IBSCBS/valores/uf/pIBSUF')),percent(n('IBSCBS/valores/mun/pIBSMun'))]))],
  [pct('Alíquota Efetiva Municipal – IBS',n('IBSCBS/valores/mun/pAliqEfetMun')),cash('Valor Apurado Municipal – IBS',n('IBSCBS/totCIBS/gIBS/gIBSMunTot/vIBSMun')),pct('Alíquota Efetiva Estadual – IBS',n('IBSCBS/valores/uf/pAliqEfetUF')),cash('Valor Apurado Estadual – IBS',n('IBSCBS/totCIBS/gIBS/gIBSUFTot/vIBSUF'))],
  [cash('Valor Total Apurado – IBS',ibsValue),pct('Alíquota – CBS',n('IBSCBS/valores/fed/pCBS')),pct('Alíquota Efetiva – CBS',n('IBSCBS/valores/fed/pAliqEfetCBS')),cash('Valor Total Apurado – CBS',cbsValue)],
 ]};
 const totals:DanfseSection={title:'VALOR TOTAL DA NFS-E',rows:[
  [title('VALOR TOTAL DA NFS-E'),cash('Valor da Operação / Serviço',p('valores/vServPrest/vServ')),cash('Desconto Incondicionado',p('valores/vDescCondIncond/vDescIncond')),cash('Desconto Condicionado',p('valores/vDescCondIncond/vDescCond'))],
  [cash('Total das Retenções (ISSQN / Federais)',n('valores/vTotalRet')),cash('Valor Líquido da NFS-e',n('valores/vLiq')),cash('Total do IBS / CBS',sum([ibsValue,cbsValue])),{...cash('Valor Líquido da NFS-e + IBS/CBS',n('IBSCBS/totCIBS/vTotNF')),emphasis:true}],
 ]};
 const tribValues=['Fed','Est','Mun'].map(s=>p('valores/trib/totTrib/vTotTrib/vTotTrib'+s));
 const tribPercent=['Fed','Est','Mun'].map(s=>p('valores/trib/totTrib/pTotTrib/pTotTrib'+s));
 const taxNames=['Federais','Estaduais','Municipais'];
 const taxLine='Totais Aproximados dos Tributos cfe. Lei nº 12.741/2012: '+taxNames.map((name,i)=>name+': '+(tribValues.some(v=>v!==null)?formatDanfseMoney(tribValues[i]):percent(tribPercent[i]))).join('; ')+'.';
 const complementary=[p('serv/infoCompl/xInfComp')&&'Inf. Cont.: '+p('serv/infoCompl/xInfComp'),p('subst/chSubstda')&&'NFS-e Subst.: '+p('subst/chSubstda'),p('serv/infoCompl/docRef')&&'Doc. Ref.: '+p('serv/infoCompl/docRef'),p('serv/obra/cObra')&&'Cod. Obra: '+p('serv/obra/cObra'),p('IBSCBS/imovel/inscImobFisc')&&'Insc. Imob.: '+p('IBSCBS/imovel/inscImobFisc'),p('serv/atvEvento/idAtvEvt')&&'Cod. Evt.: '+p('serv/atvEvento/idAtvEvt'),p('serv/infoCompl/idDocTec')&&'Doc. Tec.: '+p('serv/infoCompl/idDocTec'),p('serv/infoCompl/xPed')&&'Núm. Ped.: '+p('serv/infoCompl/xPed'),n('xOutInf')&&'Inf. A. T. Mun.: '+n('xOutInf')].filter(Boolean).join(' | ');
 const number=n('nNFSe'),processed=n('dhProc');if(!number||!processed)throw new Error('DANFSe missing identity');
 return {environment:expected.environment,accessKey:expected.accessKey,number,processed,municipality:(p('serv/cServ/cTribNac')??'').startsWith('99')?'-':joined([n('xLocEmi'),text(emit,'enderNac/UF')]),generator:label(n('ambGer'),{'1':'Prefeitura','2':'Sistema Nacional da NFS-e'}),
  identification:[
   [field('CHAVE DE ACESSO DA NFS-e',expected.accessKey,3,true)],
   [field('NÚMERO DA NFS-e',number,1,true),field('COMPETÊNCIA DA NFS-e',date(p('dCompet')),1,true),field('DATA E HORA DA EMISSÃO DA NFS-e',timestamp(processed),1,true)],
   [field('NÚMERO DA DPS',p('nDPS'),1,true),field('SÉRIE DA DPS',p('serie'),1,true),field('DATA E HORA DA EMISSÃO DA DPS',timestamp(p('dhEmi')),1,true)],
   [field('EMITENTE DA NFS-e',label(p('tpEmit'),{'1':'Prestador','2':'Tomador','3':'Intermediário'})),field('SITUAÇÃO DA NFS-e',label(n('cStat'),{'100':'NFS-e Gerada','107':'NFS-e MEI'})),field('FINALIDADE',label(p('finNFSe')??p('IBSCBS/finNFSe'),{'0':'NFS-e regular'}))],
  ],
  sections:[issuer,party('TOMADOR / ADQUIRENTE',node(dps,'toma')),party('DESTINATÁRIO DA OPERAÇÃO',node(dps,'IBSCBS/dest')),party('INTERMEDIÁRIO DA OPERAÇÃO',node(dps,'interm')),service,iss,fed,ibs,totals],description:clean(p('serv/cServ/xDescServ')??'-'),complement:clean(complementary)+(complementary?'\n':'')+taxLine,
  qrUrl:'https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave='+expected.accessKey};
}

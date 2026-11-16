import {createHash} from 'node:crypto';
import {NFSE_BASES,type NfseCredentials} from './http.ts';
import {readCompressedNfse,readFiscalJson,supportedNfseContract} from './api-contract.ts';
import {dpsRoot,singleElement,MAX_FISCAL_XML_BYTES} from './xml.ts';
import {NFSE_NAMESPACE} from './dps.ts';
import {verifyDpsSignature} from './signature.ts';
import {inspectOfficialNfseContents} from './receipt.ts';
import {dpsIdentityReport} from './identity-diagnostic.ts';
import {fiscalCorrelation,fiscalResponseObservation} from './transport-observation.ts';
import {fiscalTransportError} from './transport-error.ts';

type Material=NfseCredentials&{metadata:{subject_cnpj:string}};
type Identity={operationId:string;dpsId:string;issuerCnpj:string;snapshot:unknown};
type Dependencies={contract:unknown;load():Promise<Material>;get(url:string,material:Material):Promise<{status:number;body:Buffer}>};

/** Only two GETs derived from an owned, signed original. No state transition or POST dependency. */
export async function diagnoseIssuedNfse(identity:Identity,deps:Dependencies,revision?:string){
 const stamp=revision&&/^[a-f0-9]{7,40}$/i.test(revision)?revision.slice(0,7):'local';
 const lines=[`Diagnóstico: nfse-receipt-v1 (${stamp})`,`Correlação técnica: ${fiscalCorrelation(identity.operationId)}`];
 let material:Material|undefined,verified=false;
 try{
  const snapshot=identity.snapshot as Record<string,unknown>|null;
  const xml=snapshot?.xml,hash=snapshot?.sha256,holderCert=snapshot?.certificatePem;
  if(typeof xml!=='string'||!xml.length||Buffer.byteLength(xml)>MAX_FISCAL_XML_BYTES||typeof holderCert!=='string'||holderCert.length>32768||
   snapshot?.id!==identity.dpsId||!/^DPS\d{42}$/.test(identity.dpsId)||createHash('sha256').update(xml).digest('hex')!==hash||!verifyDpsSignature(xml,identity.dpsId,holderCert)){
   lines.push('DPS original: integridade, identidade ou assinatura não confirmada.');
  }else if(singleElement(singleElement(dpsRoot(xml,identity.dpsId,true).info,NFSE_NAMESPACE,'prest'),NFSE_NAMESPACE,'CNPJ').textContent!==identity.issuerCnpj){
   lines.push('DPS original: prestador não corresponde à empresa.');
  }else{
   const contract=supportedNfseContract(deps.contract);
   if(!contract)lines.push('Contrato oficial: não reconhecido.');
   else{
    material=await deps.load();
    if(material.metadata.subject_cnpj!==identity.issuerCnpj)lines.push('Titular do certificado: não corresponde à empresa.');
    else{
     const lookup=await deps.get(NFSE_BASES.homologation+contract.dpsPath.replace(/\{[^}]+\}/,identity.dpsId),material);
     const data=readFiscalJson(lookup.body),observation=fiscalResponseObservation(lookup.status,lookup.body);
     lines.push(`Consulta da DPS original: HTTP ${observation.http}.`,...dpsIdentityReport(data,identity.dpsId));
     if(lookup.status!==200||!data)lines.push('Consulta da DPS: não forneceu documento para conferência.');
     else{
      const identities=['idDps','idDPS'].filter(key=>Object.hasOwn(data,key)).map(key=>data[key]);
      const key=data.chaveAcesso;
      lines.push(`Ambiente da consulta: ${data.tipoAmbiente===2?'homologação':data.tipoAmbiente===1?'produção':'não reconhecido'}.`,
       `Versão do serviço na consulta: ${observation.serverVersion??'não identificada'}.`,
       `Formato da chave da consulta: ${typeof key==='string'&&/^\d{50}$/.test(key)?'50 dígitos':'não reconhecido'}.`);
      // Observed restricted GET 200 on 1.6.0 omits idDps. The request still pins the signed original;
      // this permits document retrieval only, never authorization without the embedded DPS checks.
      const missingIdentity=identities.length===0&&data.versaoAplicativo==='SefinNacional_1.6.0';
      if(data.tipoAmbiente!==2||(!missingIdentity&&!identities.includes(identity.dpsId))||identities.some(id=>id!=null&&id!==identity.dpsId)||typeof key!=='string'||!/^\d{50}$/.test(key)){
       lines.push('Consulta da DPS: ambiente, identidade ou chave não vinculados à operação.');
      }else{
       if(missingIdentity)lines.push('Compatibilidade GET 200 da SEFIN 1.6.0: identidade omitida; chave obtida pela consulta à DPS original. O XML ainda exige vínculo integral.');
       const response=await deps.get(NFSE_BASES.homologation+contract.nfsePath.replace(/\{[^}]+\}/,key),material);
       const body=readFiscalJson(response.body);
       lines.push(`Consulta da NFS-e pela chave vinculada: HTTP ${Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:0}.`);
       if(response.status!==200||!body)lines.push('Documento oficial: resposta não reconhecida.');
       else if(body.chaveAcesso!=null&&body.chaveAcesso!==key)lines.push('Documento oficial: chave contraditória no envelope.');
       else{
        lines.push(...dpsIdentityReport(body,identity.dpsId));
        const document=readCompressedNfse(body.nfseXmlGZipB64);
        if(!document)lines.push('XML da NFS-e: compressão, tamanho ou codificação não reconhecidos.');
        else{
         const inspection=await inspectOfficialNfseContents(document,{accessKey:key,dpsId:identity.dpsId,signedDps:xml,holderCert,issuerCnpj:identity.issuerCnpj});
         lines.push(...inspection.checks);verified=!!inspection.document;
        }
       }
      }
     }
    }
   }
  }
 }catch(error){lines.push(`Conferência não concluída: ${fiscalTransportError(error).reason}.`);}
 finally{material?.pfx.fill(0);}
 lines.push(`Documento conferido pela política atual: ${verified?'sim':'não'}.`);
 lines.push('Consulta atual; não recupera o envelope do primeiro envio. Estado da operação preservado. Nenhuma nota foi enviada.');
 return {details:lines.join('\n'),verified};
}

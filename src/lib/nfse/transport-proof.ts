import { validCnpj } from "../companies.ts";
import { NFSE_BASES, nfseGet,nfseHead, type NfseCredentials,type NfseEnvironment } from "./http.ts";
import { supportedNfseContract, verifiedSefinLookup,supportedDpsHeadPath } from "./api-contract.ts";

/** An empty, documented HEAD200/404 is existence evidence on the pinned SEFIN host. */
export function documentedDpsHeadResult(status:number,body:Buffer,contentType:string,rawContract:unknown):'used'|'unused'|'unverified'{
  const mime=contentType.split(';',1)[0].trim().toLowerCase();
  if(!supportedDpsHeadPath(rawContract)||body.length!==0||!['','application/json','application/problem+json'].includes(mime))return 'unverified';
  return status===200?'used':status===404?'unused':'unverified';
}

export async function inspectOwnProductionSefinTransport(input:{municipality:string;cnpj:string;holderCnpj:string;series:string},credentials:NfseCredentials,rawContract:unknown,request=nfseHead){
  if(input.cnpj!==input.holderCnpj)return {verified:false,http:0};
  const path=supportedDpsHeadPath(rawContract);if(!path)return {verified:false,http:0};
  const id=ownSefinLookupId(input.municipality,input.cnpj,input.series);
  const response=await request('production',NFSE_BASES.production+path.replace(/\{[^}]+\}/,id),credentials,5000);
  return {verified:documentedDpsHeadResult(response.status,response.body,response.contentType,rawContract)!=='unverified',http:response.status};
}

export function ownSefinLookupId(municipality: string, cnpj: string, series: string) {
  if (!/^[1-9]\d{6}$/.test(municipality) || !/^\d{14}$/.test(cnpj) || !validCnpj(cnpj) ||
    !/^\d{1,5}$/.test(series) || BigInt(series) < 1n || BigInt(series) > 49999n) throw new Error("Invalid fiscal lookup identity.");
  // Existence query in the holder's actual configured namespace. No number is reserved or consumed.
  return `DPS${municipality}2${cnpj}${series.padStart(5, "0")}${"1".padStart(15, "0")}`;
}

export async function inspectOwnSefinTransport(input: { municipality: string; cnpj: string; holderCnpj: string; series: string }, credentials: NfseCredentials, rawContract: unknown, request = nfseGet,environment:NfseEnvironment='homologation') {
  if (input.cnpj !== input.holderCnpj) return {verified:false,http:0};
  const contract = supportedNfseContract(rawContract);
  if (!contract) return {verified:false,http:0};
  const id = ownSefinLookupId(input.municipality, input.cnpj, input.series);
  const url = NFSE_BASES[environment] + contract.dpsPath.replace(/\{[^}]+\}/, id);
  const response = await request(environment, url, credentials, 5000);
  return {verified:verifiedSefinLookup(response.status, response.body, id, rawContract,environment),http:response.status};
}
export async function verifyOwnSefinTransport(input: { municipality: string; cnpj: string; holderCnpj: string; series: string }, credentials: NfseCredentials, rawContract: unknown, request=nfseGet,environment:NfseEnvironment='homologation'){
 return (await inspectOwnSefinTransport(input,credentials,rawContract,request,environment)).verified;
}

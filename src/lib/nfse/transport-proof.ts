import { validCnpj } from "../companies.ts";
import { NFSE_BASES, nfseGet, type NfseCredentials,type NfseEnvironment } from "./http.ts";
import { supportedNfseContract, verifiedSefinLookup,readFiscalJson } from "./api-contract.ts";

/** Conservative candidate check, distinct from general mTLS transport evidence. */
export function productionDpsAvailability(status:number,body:Buffer,id:string,rawContract:unknown):'used'|'unused'|'unverified'{
  if(status===200)return 'used';
  if(status!==404||!verifiedSefinLookup(status,body,id,rawContract,'production'))return 'unverified';
  const data=readFiscalJson(body)!;
  if(['idDps','idDPS'].some(field=>data[field]!=null&&data[field]!==id)||data.chaveAcesso!=null||data.nfseXmlGZipB64!=null)return 'unverified';
  const entries=Object.entries(data).filter(([field])=>/^erros?$/i.test(field));
  if(entries.length!==1)return 'unverified';
  const errors=Array.isArray(entries[0][1])?entries[0][1]:[entries[0][1]];
  if(errors.length!==1||!errors[0]||typeof errors[0]!=='object'||Array.isArray(errors[0]))return 'unverified';
  const codes=Object.entries(errors[0]).filter(([field])=>/^codigo$/i.test(field));
  return codes.length===1&&codes[0][1]==='E2404'?'unused':'unverified';
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

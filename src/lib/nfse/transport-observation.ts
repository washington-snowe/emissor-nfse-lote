import { createHash } from "node:crypto";
import { readFiscalJson } from "./api-contract.ts";
import { fiscalTransportError } from "./transport-error.ts";

export type FiscalRequestStage = "submit" | "dps_lookup" | "nfse_lookup";
export function fiscalCorrelation(operationId: string) { return createHash("sha256").update(operationId).digest("hex").slice(0,16); }
export function fiscalRequestTimeout(method: "GET" | "POST", remainingMs: number) {
  // Leave time for the final persisted outcome. An increased timeout never allows another POST.
  return Number.isFinite(remainingMs)?Math.max(1, Math.min(method === "POST" ? 20_000 : 5000, Math.floor(remainingMs - 10000))):1;
}
export function fiscalResponseObservation(status: number, body: Buffer) {
  const data=readFiscalJson(body);
  let format="other";
  if(!body.length)format="empty";
  else if(data)format="json_object";
  else if(/^\s*(?:<!doctype\s+html|<html\b)/i.test(body.subarray(0,512).toString("utf8")))format="html";
  const codes:string[]=[];
  for(const field of ["erro","erros","Erro","Erros"]){
    const value=data?.[field],items=Array.isArray(value)?value.slice(0,100):[value];
    for(const item of items)if(item&&typeof item==="object"&&!Array.isArray(item))for(const key of ["codigo","Codigo"]){
      const code=(item as Record<string,unknown>)[key];
      if(typeof code==="string"&&/^E\d{4}$/.test(code)&&!codes.includes(code)&&codes.length<10)codes.push(code);
    }
  }
  const environment=data?.tipoAmbiente;
  return {http:Number.isInteger(status)&&status>=100&&status<=599?status:0,format,
    environment:environment===0?"number_0":environment===1?"number_1":environment===2?"number_2":environment===undefined?"missing":"other",codes};
}

/** All emitted properties are fixed categories, hashes or bounded numbers; no raw request/response/error. */
export async function observedFiscalRequest<T extends {status:number;body:Buffer}>(input:{operationId:string;stage:FiscalRequestStage;timeoutMs:number},request:()=>Promise<T>,observe:(event:Record<string,unknown>)=>void|Promise<void>){
  const correlation=fiscalCorrelation(input.operationId),started=Date.now(),stage=["submit","dps_lookup","nfse_lookup"].includes(input.stage)?input.stage:"unknown";
  const emit=async(fields:Record<string,unknown>)=>{try{await observe({event:"nfse_transport",correlation,stage,...fields});}catch{/* Observation failure must not alter fiscal state or cause retries. */}};
  await emit({phase:"start",timeoutMs:Number.isFinite(input.timeoutMs)?Math.min(20_000,Math.max(1,Math.floor(input.timeoutMs))):1});
  try{
    const response=await request();
    await emit({phase:"response",...fiscalResponseObservation(response.status,response.body),elapsedMs:Math.min(60_000,Math.max(0,Date.now()-started))});
    return response;
  }catch(error){
    await emit({phase:"failure",transport:fiscalTransportError(error).reason,elapsedMs:Math.min(60_000,Math.max(0,Date.now()-started))});
    throw error;
  }
}

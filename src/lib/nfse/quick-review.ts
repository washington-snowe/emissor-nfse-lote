import { createHash } from "node:crypto";
import { canonicalReviewJson,cleanFiscalPerson,type ReviewSnapshot,type ReviewPreview,type ReviewCandidate,type ReviewIssue } from "./review.ts";
import type {FiscalPerson} from "./dps.ts";
import type {ParsedShopeeReport} from "../shopee-seller-csv.ts";

export type QuickReviewInput={competenceDate:string;commissionType:string;evidenceReference:string;recipientChoice:string;grouping:string;
  commonRecipient?:FiscalPerson;intermediary?:FiscalPerson;recipients:{row:number;person?:FiscalPerson;foreignAmount?:string}[]};
export type QuickReviewData={importId:string;companyId:string;input:QuickReviewInput;candidates:ReviewCandidate[];preview?:ReviewPreview;digest?:string;
  version:number;error?:string;issues?:ReviewIssue[];foreignForAll:boolean;currency?:string;needsIntermediary:boolean;transmissionEnabled:boolean;
  validityAdjustment?:{profileId:string;profileVersion:number;profileHash:string;currentFrom:string;targetFrom:string;previewDigest:string};};

export function suggestedCompetence(report:ParsedShopeeReport):string {
  const periods=[...new Set(report.reportedSellers.map(s=>s.referencePeriod))];
  if(periods.length!==1||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(periods[0]))return "";
  const [year,month]=periods[0].split("-").map(Number);
  return `${periods[0]}-${new Date(Date.UTC(year,month,0)).getUTCDate()}`;
}
export function quickReviewDefaults(report:ParsedShopeeReport,recipient:FiscalPerson,previous?:ReviewSnapshot):QuickReviewInput {
  return previous ? {competenceDate:previous.competenceDate,commissionType:previous.commissionType,evidenceReference:previous.evidenceReference,
    recipientChoice:previous.recipientChoice,grouping:previous.grouping,commonRecipient:previous.recipientChoice==="single_recipient"?previous.groups[0].recipient:undefined,
    intermediary:previous.groups[0].intermediary,recipients:previous.groups.flatMap(g=>g.allocations.map(a=>({row:a.row,person:previous.recipientChoice==="reported_sellers"?g.recipient:undefined,foreignAmount:a.foreignAmount})))} :
    {competenceDate:suggestedCompetence(report),commissionType:"Comissões de afiliado Shopee",recipientChoice:"single_recipient",commonRecipient:recipient,grouping:"per_row",
      evidenceReference:"Modelo de afiliados Shopee no aplicativo rex; competência sugerida pelo mês do relatório; tomador, valores e agrupamento sujeitos à revisão e confirmação do titular.",recipients:[]};
}
export function cleanQuickReviewInput(value:unknown):QuickReviewInput|null {
  if(!value||typeof value!=="object"||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  const string=(key:string,max:number)=>typeof raw[key]==="string"&&(raw[key] as string).length<=max?raw[key] as string:null;
  const competenceDate=string("competenceDate",10),commissionType=string("commissionType",120),evidenceReference=string("evidenceReference",500),recipientChoice=string("recipientChoice",30),grouping=string("grouping",30);
  if(competenceDate===null||commissionType===null||evidenceReference===null||recipientChoice===null||grouping===null||!Array.isArray(raw.recipients)||raw.recipients.length>500)return null;
  const recipients:QuickReviewInput["recipients"]=[];
  for(const value of raw.recipients){if(!value||typeof value!=="object"||!Number.isSafeInteger(value.row)||value.foreignAmount!==undefined&&(typeof value.foreignAmount!=="string"||value.foreignAmount.length>18))return null;
    recipients.push({row:value.row,person:value.person?cleanFiscalPerson(value.person):undefined,foreignAmount:value.foreignAmount});}
  return {competenceDate,commissionType,evidenceReference,recipientChoice,grouping,commonRecipient:raw.commonRecipient?cleanFiscalPerson(raw.commonRecipient):undefined,intermediary:raw.intermediary?cleanFiscalPerson(raw.intermediary):undefined,recipients};
}
export function quickReviewDigest(preview:ReviewPreview) {return createHash("sha256").update(canonicalReviewJson(preview)).digest("hex");}

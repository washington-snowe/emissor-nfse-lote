import { validCnpj } from "../companies.ts";

export const NFSE_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";
export type FiscalAddress = {
  country: string; postalCode: string; municipalityCode?: string; city?: string; province?: string;
  street: string; number: string; district: string; complement?: string;
};
export type FiscalPerson = {
  kind: "cnpj" | "cpf" | "foreign" | "no_nif"; document: string;
  country: string; legalName: string; address?: FiscalAddress; email?: string;
};
export type ForeignTrade = {
  mode: string; relationship: string; currency: string; amount: string;
  providerIncentive: string; recipientIncentive: string; temporaryGoods: string; mdic: string;
  importDeclaration?: string; exportRegistration?: string;
};
export type TaxTotals =
  | { mode: "not_informed" }
  | { mode: "simples_percent"; percent: string }
  | { mode: "percentages" | "amounts"; federal: string; state: string; municipal: string };
export type FiscalProfile = {
  issuerMunicipality: string; issuerRegistration?: string; series: string;
  simplesOption: "2" | "3"; simplesAssessment?: "1" | "2" | "3";
  specialRegime: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "9";
  serviceMunicipality?: string; serviceCountry?: string;
  nationalTaxCode: string; municipalTaxCode?: string; nbsCode?: string; description: string;
  issTaxation: "1" | "2" | "3" | "4"; issWithholding: "1" | "2" | "3";
  issRate?: string; immunityType?: string; exportResultCountry?: string;
  totals: TaxTotals; foreignTrade?: Omit<ForeignTrade, "amount">;
};
export type DpsInput = {
  environment: "homologation" | "production";
  issuerCnpj: string; dpsNumber: string; competenceDate: string; emissionTime: string;
  amount: string; foreignAmount?: string; profile: FiscalProfile; recipient: FiscalPerson; intermediary?: FiscalPerson;
};

function check(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid fiscal field: ${field}`);
}
function text(value: unknown, field: string, max: number) {
  check(typeof value==="string" && value.length>0 && value.length<=max && value===value.trim() &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(value) && Buffer.from(value).toString("utf8")===value,field);
  return value;
}
function digits(value: unknown, field: string, length: number) {
  text(value,field,length); check((value as string).length===length && /^\d+$/.test(value as string),field); return value as string;
}
function country(value: unknown, field: string) {
  text(value,field,2); check(/^[A-Z]{2}$/.test(value as string),field); return value as string;
}
export function validFiscalDate(value: unknown): value is string {
  if (typeof value!=="string" || value.length!==10 || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const time=new Date(value+"T00:00:00Z");
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0,10)===value;
}
export function fiscalDecimal(value: unknown, field: string, positive = false, integerDigits = 15) {
  check(typeof value==="string" && value.length<=integerDigits+3 && /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value),field);
  const [whole,fraction=""]=(value as string).split(".");
  check(whole.length<=integerDigits && (!positive || BigInt(whole+fraction.padEnd(2,"0"))>0n),field);
  return `${whole}.${fraction.padEnd(2,"0")}`;
}
function xml(value: string) { return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]!)); }
const tag=(name:string,value:string)=>`<${name}>${xml(value)}</${name}>`;
const optional=(name:string,value:string|undefined,max=60)=>value===undefined ? "" : tag(name,text(value,name,max));

function cpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (let size=9;size<=10;size++) {
    const sum=[...value.slice(0,size)].reduce((total,digit,index)=>total+Number(digit)*(size+1-index),0);
    if (((sum*10)%11)%10!==Number(value[size])) return false;
  }
  return true;
}
function personXml(person: FiscalPerson) {
  const nation=country(person.country,"recipient.country");
  let identity: string;
  if (person.kind==="cnpj") { digits(person.document,"recipient.cnpj",14); check(validCnpj(person.document),"recipient.cnpj"); identity=tag("CNPJ",person.document); }
  else if (person.kind==="cpf") { check(cpf(person.document),"recipient.cpf"); identity=tag("CPF",person.document); }
  else if (person.kind==="foreign") { check(nation!=="BR","recipient.country"); identity=tag("NIF",text(person.document,"recipient.nif",40)); }
  else { check(person.kind==="no_nif" && nation!=="BR" && ["0","1","2"].includes(person.document),"recipient.no_nif_reason"); identity=tag("cNaoNIF",person.document); }
  let address="";
  check(nation==="BR" || person.address!==undefined,"recipient.foreign_address");
  if (person.address) {
    const a=person.address;
    check(a.country===nation,"recipient.address_country");
    const specific=nation==="BR" ? `<endNac>${tag("cMun",digits(a.municipalityCode,"recipient.municipality",7))}${tag("CEP",digits(a.postalCode,"recipient.postal_code",8))}</endNac>` :
      `<endExt>${tag("cPais",nation)}${tag("cEndPost",text(a.postalCode,"recipient.postal_code",11))}${tag("xCidade",text(a.city,"recipient.city",60))}${tag("xEstProvReg",text(a.province,"recipient.province",60))}</endExt>`;
    address=`<end>${specific}${tag("xLgr",text(a.street,"recipient.street",255))}${tag("nro",text(a.number,"recipient.number",60))}${optional("xCpl",a.complement,156)}${tag("xBairro",text(a.district,"recipient.district",60))}</end>`;
  }
  return identity+tag("xNome",text(person.legalName,"recipient.name",300))+address+optional("email",person.email,80);
}

function totalsXml(totals: TaxTotals, simples: "2"|"3") {
  if (totals.mode==="not_informed") { check(simples==="2","totals.not_informed_for_simples"); return tag("indTotTrib","0"); }
  if (totals.mode==="simples_percent") { check(simples==="3","totals.simples_percent_for_mei"); return tag("pTotTribSN",fiscalDecimal(totals.percent,"totals.simples_percent",false,2)); }
  check(totals.mode==="percentages" || totals.mode==="amounts","totals.mode");
  const prefix=totals.mode==="percentages" ? "p" : "v",limit=totals.mode==="percentages" ? 2 : 15;
  return `<${prefix}TotTrib>${tag(prefix+"TotTribFed",fiscalDecimal(totals.federal,"totals.federal",false,limit))}${tag(prefix+"TotTribEst",fiscalDecimal(totals.state,"totals.state",false,limit))}${tag(prefix+"TotTribMun",fiscalDecimal(totals.municipal,"totals.municipal",false,limit))}</${prefix}TotTrib>`;
}

function foreignTradeXml(trade: ForeignTrade) {
  const code=(value:string,field:string,max=3)=>{text(value,field,max);check(/^\d+$/.test(value),field);return value;};
  return `<comExt>${tag("mdPrestacao",code(trade.mode,"foreign.mode",1))}${tag("vincPrest",code(trade.relationship,"foreign.relationship",1))}${tag("tpMoeda",digits(trade.currency,"foreign.currency",3))}${tag("vServMoeda",fiscalDecimal(trade.amount,"foreign.amount",true))}${tag("mecAFComexP",code(trade.providerIncentive,"foreign.provider_incentive"))}${tag("mecAFComexT",code(trade.recipientIncentive,"foreign.recipient_incentive"))}${tag("movTempBens",code(trade.temporaryGoods,"foreign.temporary_goods",1))}${optional("nDI",trade.importDeclaration,12)}${optional("nRE",trade.exportRegistration,12)}${tag("mdic",code(trade.mdic,"foreign.mdic",1))}</comExt>`;
}

export function buildDps(input: DpsInput) {
  const p=input.profile;
  digits(input.issuerCnpj,"issuer.cnpj",14);check(validCnpj(input.issuerCnpj),"issuer.cnpj");
  const municipality=digits(p.issuerMunicipality,"issuer.municipality",7);
  text(p.series,"series",5);check(/^\d{1,5}$/.test(p.series) && BigInt(p.series)>=1n && BigInt(p.series)<=49999n,"series");
  const series=p.series.padStart(5,"0");
  check(typeof input.dpsNumber==="string" && /^[1-9]\d{0,14}$/.test(input.dpsNumber),"dps_number");
  check(validFiscalDate(input.competenceDate),"competence_date");
  // Anexo I fields 46/335 defer mandatory IBS/CBS for SN to 2027; this profile does not implement it yet.
  check(input.competenceDate<"2027-01-01","ibscbs_profile_required_for_2027");
  text(input.emissionTime,"emission_time",25);
  check(/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:00$/.test(input.emissionTime) && validFiscalDate(input.emissionTime.slice(0,10)) && Number.isFinite(Date.parse(input.emissionTime)),"emission_time");
  check(input.environment==="homologation" || input.environment==="production","environment");
  check(["2","3"].includes(p.simplesOption),"simples_option");
  check(p.simplesOption==="2" ? p.simplesAssessment===undefined : ["1","2","3"].includes(p.simplesAssessment ?? ""),"simples_assessment");
  check(["0","1","2","3","4","5","6","9"].includes(p.specialRegime),"special_regime");
  check(Boolean(p.serviceMunicipality)!==Boolean(p.serviceCountry),"service_location");
  const location=p.serviceMunicipality ? tag("cLocPrestacao",digits(p.serviceMunicipality,"service.municipality",7)) : tag("cPaisPrestacao",country(p.serviceCountry,"service.country"));
  check(["1","2","3","4"].includes(p.issTaxation),"iss_taxation");check(["1","2","3"].includes(p.issWithholding),"iss_withholding");
  check(p.issWithholding!=="3" || input.intermediary!==undefined,"intermediary_required");
  check(p.issTaxation==="3" ? p.exportResultCountry!==undefined : p.exportResultCountry===undefined,"export_result_country");
  check(p.issTaxation==="2" ? p.immunityType!==undefined : p.immunityType===undefined,"immunity_type");
  if (p.immunityType!==undefined) check(["0","1","2","3","4","5"].includes(p.immunityType),"immunity_type");
  const exterior=input.recipient.country!=="BR" || (input.intermediary && input.intermediary.country!=="BR") || p.serviceCountry!==undefined || p.issTaxation==="3";
  check(!exterior || p.foreignTrade!==undefined,"foreign_trade_required");
  const id=`DPS${municipality}2${input.issuerCnpj}${series}${input.dpsNumber.padStart(15,"0")}`;
  const issuer=`<prest>${tag("CNPJ",input.issuerCnpj)}${optional("IM",p.issuerRegistration,15)}<regTrib>${tag("opSimpNac",p.simplesOption)}${optional("regApTribSN",p.simplesAssessment)}${tag("regEspTrib",p.specialRegime)}</regTrib></prest>`;
  const taxation=`<tribMun>${tag("tribISSQN",p.issTaxation)}${p.exportResultCountry ? tag("cPaisResult",country(p.exportResultCountry,"export_result_country")) : ""}${optional("tpImunidade",p.immunityType)}${tag("tpRetISSQN",p.issWithholding)}${p.issRate!==undefined ? tag("pAliq",fiscalDecimal(p.issRate,"iss_rate",false,1)) : ""}</tribMun>`;
  const trade = exterior || input.foreignAmount !== undefined ? p.foreignTrade : undefined;
  check(trade ? input.foreignAmount!==undefined : input.foreignAmount===undefined,"foreign_amount");
  const service=`<serv><locPrest>${location}</locPrest><cServ>${tag("cTribNac",digits(p.nationalTaxCode,"national_tax_code",6))}${optional("cTribMun",p.municipalTaxCode,20)}${tag("xDescServ",text(p.description,"description",2000))}${p.nbsCode ? tag("cNBS",digits(p.nbsCode,"nbs_code",9)) : ""}</cServ>${trade ? foreignTradeXml({...trade,amount:input.foreignAmount!}) : ""}</serv>`;
  return { id,xml:`<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NFSE_NAMESPACE}" versao="1.01"><infDPS Id="${id}">${tag("tpAmb",input.environment==="production" ? "1" : "2")}${tag("dhEmi",input.emissionTime)}${tag("verAplic","Emissor_0.1")}${tag("serie",series)}${tag("nDPS",input.dpsNumber)}${tag("dCompet",input.competenceDate)}${tag("tpEmit","1")}${tag("cLocEmi",municipality)}${issuer}<toma>${personXml(input.recipient)}</toma>${input.intermediary ? `<interm>${personXml(input.intermediary)}</interm>` : ""}${service}<valores><vServPrest>${tag("vServ",fiscalDecimal(input.amount,"service_amount",true))}</vServPrest><trib>${taxation}<totTrib>${totalsXml(p.totals,p.simplesOption)}</totTrib></trib></valores></infDPS></DPS>` };
}

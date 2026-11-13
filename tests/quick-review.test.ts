import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {parseShopeeSellerCsv} from "../src/lib/shopee-seller-csv.ts";
import {previewFiscalReview,prepareFiscalReview,readReviewSnapshot} from "../src/lib/nfse/review.ts";
import {quickReviewDefaults,suggestedCompetence,cleanQuickReviewInput,quickReviewDigest} from "../src/lib/nfse/quick-review.ts";
import {validateFiscalDocuments} from "../src/lib/nfse/schema.ts";
import {buildDps,type FiscalProfile} from "../src/lib/nfse/dps.ts";
const profile:FiscalProfile={issuerMunicipality:"3550308",series:"1",simplesOption:"2",specialRegime:"0",serviceMunicipality:"3550308",nationalTaxCode:"170601",description:"Teste sintético",issTaxation:"1",issWithholding:"1",totals:{mode:"not_informed"}};
const binding={companyId:"00000000-0000-4000-8000-000000000001",issuerCnpj:"11222333000181",importId:"00000000-0000-4000-8000-000000000002",profileId:"00000000-0000-4000-8000-000000000003",profileSha256:"a".repeat(64),profileVersion:1,profile};
const recipient={kind:"cnpj" as const,country:"BR",document:"11444777000161",legalName:"Tomador sintético Shopee"};
async function fixture(){const parsed=await parseShopeeSellerCsv(await readFile("tests/fixtures/shopee-seller-monthly-v1.csv"));assert.ok(parsed.data);return parsed.data;}
test("prévia automática preenche o modelo, preserva todas as linhas e ainda não é confirmação",async()=>{
  const report=await fixture(),input=quickReviewDefaults(report,recipient),preview=previewFiscalReview(report,input,binding);
  assert.equal(input.competenceDate,"2026-10-31");assert.equal(input.recipientChoice,"single_recipient");assert.equal(input.grouping,"per_row");
  assert.ok(preview.snapshot);assert.equal(preview.snapshot.recipientRoleConfirmed,false);assert.equal(preview.snapshot.total,"11.00");assert.equal(preview.snapshot.groups.length,4);
  assert.equal(readReviewSnapshot(preview.snapshot,binding.importId,report.review.source.fileSha256),null);
  assert.equal(prepareFiscalReview(report,input,binding).snapshot,undefined,"default fill must not imply the owner's confirmation");
  const confirmed=prepareFiscalReview(report,{...input,confirmRecipientRole:true},binding).snapshot;assert.ok(confirmed);assert.equal(confirmed.recipientRoleConfirmed,true);
  const probes=confirmed.groups.map(group=>buildDps({environment:"homologation",issuerCnpj:binding.issuerCnpj,profile,dpsNumber:"1",amount:group.amount,competenceDate:confirmed.competenceDate,emissionTime:`${confirmed.competenceDate}T12:00:00+00:00`,recipient:group.recipient}).xml);
  assert.ok(await validateFiscalDocuments(probes,"DPS"));
});
test("digest invalida prévia alterada, perfil/arquivo diferentes e novo agrupamento",async()=>{
  const report=await fixture(),input=quickReviewDefaults(report,recipient),first=previewFiscalReview(report,input,binding).snapshot!;
  for(const changed of [{...input,competenceDate:"2026-11-01"},{...input,grouping:"same_recipient"},{...input,commonRecipient:{...recipient,legalName:"Outro tomador"}}]){
    const next=previewFiscalReview(report,changed,binding).snapshot!;assert.notEqual(quickReviewDigest(first),quickReviewDigest(next));
  }
  assert.notEqual(quickReviewDigest(first),quickReviewDigest(previewFiscalReview(report,input,{...binding,profileVersion:2,profileSha256:"b".repeat(64)}).snapshot!));
  assert.equal(quickReviewDigest(first),quickReviewDigest(structuredClone(first)));
  const consolidated=previewFiscalReview(report,{...input,grouping:"same_recipient"},binding).snapshot!;
  assert.equal(consolidated.groups.length,1);assert.equal(consolidated.groups[0].allocations.length,4);assert.equal(consolidated.total,"11.00");
});
test("competência é sugestão editável, usa calendário UTC e não escolhe entre meses misturados",async()=>{
  const report=await fixture();
  for(const [period,day] of [["2024-02","2024-02-29"],["2026-02","2026-02-28"],["2026-04","2026-04-30"]]){report.reportedSellers.forEach(s=>s.referencePeriod=period);assert.equal(suggestedCompetence(report),day);}
  report.reportedSellers[0].referencePeriod="2026-05";assert.equal(suggestedCompetence(report),"");
});
test("reaproveita revisão anterior e ignora identidades de servidor/confirmacão injetadas",async()=>{
  const report=await fixture(),input=quickReviewDefaults(report,recipient),snapshot=prepareFiscalReview(report,{...input,competenceDate:"2026-11-01",grouping:"same_recipient",confirmRecipientRole:true},binding).snapshot!;
  const saved=quickReviewDefaults(report,recipient,snapshot);assert.equal(saved.competenceDate,"2026-11-01");assert.equal(saved.grouping,"same_recipient");
  const clean=cleanQuickReviewInput({...input,tenant_id:"FOREIGN",profileId:"FORGED",confirmRecipientRole:true,commonRecipient:{...recipient,privateKey:"DO NOT COPY"}});
  assert.ok(clean);assert.equal(JSON.stringify(clean).includes("FOREIGN"),false);assert.equal(JSON.stringify(clean).includes("DO NOT COPY"),false);assert.equal("confirmRecipientRole" in clean,false);
  assert.equal(cleanQuickReviewInput({...input,recipients:[{row:"2"}]}),null);
});
test("a automação não descarta negativos, moeda incompatível ou origem repetida",async()=>{
  for(const mode of ["negative","currency","duplicate"]){const report=await fixture();if(mode==="negative")report.review.rows[0].amount="-1.10";if(mode==="currency")report.review.rows[0].currency="USD";if(mode==="duplicate")report.reportedSellers[1].storeId=report.reportedSellers[0].storeId;
    assert.equal(previewFiscalReview(report,quickReviewDefaults(report,recipient),binding).snapshot,undefined);}
});

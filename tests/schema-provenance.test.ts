import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("XSDs oficiais permanecem idênticos ao pacote de origem e com proveniência registrada",()=>{
  const manifest=JSON.parse(readFileSync(new URL("../integrations/nfse/provenance.json",import.meta.url),"utf8"));
  assert.equal(manifest.files.length,10);
  for (const item of manifest.files) {
    assert.ok(item.file.startsWith("integrations/nfse/schemas/1.01/"));
    const bytes=readFileSync(new URL("../"+item.file,import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"),item.sha256);
  }
  assert.ok(manifest.artifacts.every((item: {url:string;sha256:string})=>item.url.startsWith("https://www.gov.br/nfse/") && /^[0-9a-f]{64}$/.test(item.sha256)));
});

test('pacote oficial de homologação é íntegro, separado do legado e registra a finalidade obrigatória',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../integrations/nfse/homologation-20261020.provenance.json',import.meta.url),'utf8'));
 assert.equal(manifest.environment,'homologation');assert.equal(manifest.files.length,10);
 assert.match(manifest.portal,/\/producao-restrita$/);
 for(const item of manifest.files){
  assert.ok(item.file.startsWith('integrations/nfse/schemas/homologation/20261020/'));
  assert.equal(createHash('sha256').update(readFileSync(new URL('../'+item.file,import.meta.url))).digest('hex'),item.sha256);
 }
 assert.equal(manifest.evidence.required_regular_purpose.field,'finNFSe');assert.equal(manifest.evidence.required_regular_purpose.value,'0');
});

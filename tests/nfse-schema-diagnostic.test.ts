import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import {schemaFieldsFromMessage,SCHEMA_FIELDS} from '../src/lib/nfse/schema-evidence.ts';
import {fiscalResponseObservation} from '../src/lib/nfse/transport-observation.ts';
import {durableFiscalReport} from '../src/lib/nfse/durable-report.ts';
import {inspectStoredDps} from '../src/lib/nfse/stored-dps-diagnostic.ts';
import {identity,signedDps} from './helpers/fiscal-fixture.ts';
const secret='PRIVATE_RAW_CUSTOMER_DATA';
test('erros XSD exportam só nomes de campos conhecidos, nunca valores ou descrições',()=>{
 const message=`Element '{http://www.sped.fazenda.gov.br/nfse}cTribNac': value '${secret}' invalid; attribute 'versao' invalid; elemento 'xDescServ'; element '${secret}'`;
 assert.deepEqual(schemaFieldsFromMessage(message),['cTribNac','versao','xDescServ']);
 assert.deepEqual(schemaFieldsFromMessage(null),[]);assert.deepEqual(schemaFieldsFromMessage('x'.repeat(16385)),[]);
 assert.equal(schemaFieldsFromMessage(SCHEMA_FIELDS.map(f=>`element '${f}'`).join(' ')).length,10);
 const data=fiscalResponseObservation(400,Buffer.from(JSON.stringify({tipoAmbiente:2,idDPS:null,versaoAplicativo:'SefinNacional_1.4.0',erros:[{codigo:'E1235',descricao:message}]})),'DPS_PRIVATE');
 assert.deepEqual(data.xsdFields,['cTribNac','versao','xDescServ']);assert.equal(data.dpsIdentity,'null');assert.equal(data.serverVersion,'SefinNacional_1.4.0');assert.ok(!JSON.stringify(data).includes(secret));
 for(const [returned,category] of [[{},'missing'],[{idDPS:'DPS_PRIVATE'},'matching'],[{idDPS:null,idDps:'foreign'},'mismatch'],[{idDPS:123},'invalid']] as const)
  assert.equal(fiscalResponseObservation(400,Buffer.from(JSON.stringify(returned)),'DPS_PRIVATE').dpsIdentity,category);
 const other=fiscalResponseObservation(400,Buffer.from(JSON.stringify({erros:[{codigo:'E0710',descricao:message}],versaoAplicativo:secret})));
 assert.ok(!Object.hasOwn(other,'xsdFields'));assert.ok(!Object.hasOwn(other,'serverVersion'));
 const report=durableFiscalReport([{stage:'submit',data:{...data,phase:'response',elapsedMs:800}}]).join('\n');
 assert.match(report,/E1235: falha no esquema XML/);assert.match(report,/Identidade na resposta: nula/);assert.ok(!report.includes(secret));assert.ok(!report.includes('DPS_PRIVATE'));
 const malicious=durableFiscalReport([{stage:'submit',data:{...data,phase:'response',elapsedMs:1,xsdFields:[secret],serverVersion:secret,dpsIdentity:secret}}]).join('\n');assert.ok(!malicious.includes(secret));
});
test('análise usa snapshot original, confere hash, assinatura e XSD sem devolver XML ou identidade',async()=>{
 const holder=identity(),signed=signedDps(holder);
 const snapshot={...signed,sha256:createHash('sha256').update(signed.xml).digest('hex'),certificatePem:holder.certificatePem};
 const result=(await inspectStoredDps(snapshot)).join('\n');
 assert.match(result,/Hash do XML original: confere/);assert.match(result,/Assinatura com o certificado público original: confere/);assert.match(result,/XSD local 1.01: estrutura aceita/);
 for(const privateValue of [signed.xml,signed.id,holder.certificatePem,'11222333000181','11.01'])assert.ok(!result.includes(privateValue));
 const tampered=signed.xml.replace('<cTribNac>010101','<cTribNac>private-invalid');
 const hashFailure=(await inspectStoredDps({...snapshot,xml:tampered})).join('\n');assert.match(hashFailure,/Hash do XML original: divergente/);assert.ok(!hashFailure.includes('XSD local'));
 const invalid=(await inspectStoredDps({...snapshot,xml:tampered,sha256:createHash('sha256').update(tampered).digest('hex')})).join('\n');
 assert.match(invalid,/Assinatura com o certificado público original: não validada/);assert.match(invalid,/estrutura recusada/);assert.match(invalid,/Campos apontados pelo XSD local: cTribNac/);assert.ok(!invalid.includes('private-invalid'));
 assert.match((await inspectStoredDps(null)).join(''),/indisponível/);
 const malformed='<!DOCTYPE DPS><DPS/>';
 assert.match((await inspectStoredDps({...snapshot,xml:malformed,sha256:createHash('sha256').update(malformed).digest('hex')})).join('\n'),/Estrutura XML: inválida/);
});

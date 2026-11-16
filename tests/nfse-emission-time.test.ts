import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fiscalEmissionTime,emissionTimeReport} from '../src/lib/nfse/emission-time.ts';
import {durableFiscalReport,needsStoredDpsInspection,storedContractReport} from '../src/lib/nfse/durable-report.ts';
import {readFileSync} from 'node:fs';

test('dhEmi usa São Paulo preservando exatamente o instante, inclusive na virada do dia',()=>{
 for(const [source,expected] of [
  ['2026-11-16T16:09:55.987Z','2026-11-16T13:09:55-03:00'],
  ['2026-11-16T01:00:00.500Z','2026-11-15T22:00:00-03:00'],
  ['2026-11-16T03:00:00.000Z','2026-11-16T00:00:00-03:00'],
  ['2026-01-01T02:00:00.000Z','2025-12-31T23:00:00-03:00'],
 ]){
  const now=Date.parse(source),actual=fiscalEmissionTime(now);
  assert.equal(actual,expected);assert.equal(Date.parse(actual),Math.floor(now/1000)*1000);
 }
 assert.throws(()=>fiscalEmissionTime(NaN),/clock/);assert.throws(()=>fiscalEmissionTime(Infinity),/clock/);
});
test('comparação temporal é limitada e não declara conhecer dhProc ausente do primeiro retorno',()=>{
 const a=emissionTimeReport('2026-11-16T16:09:55+00:00','2026-11-16T16:09:55.300Z').join('\n');
 const b=emissionTimeReport('2026-11-16T13:09:55-03:00','2026-11-16T16:09:55.300Z').join('\n');
 assert.match(a,/UTC \(\+00:00\)/);assert.match(b,/São Paulo \(-03:00\)/);
 assert.match(a,/registrado: -0.3 s/);assert.match(b,/registrado: -0.3 s/);
 assert.match(a,/não recupera o horário do primeiro processamento/);
 assert.match(emissionTimeReport('2026-02-30T13:00:00-03:00').join(''),/não reconhecido/);
 assert.match(emissionTimeReport('PRIVATE_CUSTOMER_DATA').join(''),/não reconhecido/);
 assert.match(emissionTimeReport('2026-11-16T16:09:55+00:00').join(''),/indisponível/);
 assert.match(emissionTimeReport('2026-11-16T16:09:55+00:00','2026-01-01').join(''),/superior a um dia/);
});
test('E0008 permite diagnóstico do snapshot e informa contrato atual sem expor corpos ou inferir rejeição histórica',()=>{
 const traces=[{stage:'submit',data:{phase:'response',http:400,format:'json_object',environment:'number_2',codes:['E0008'],elapsedMs:800,private:'PRIVATE_DATA'}}];
 assert.ok(needsStoredDpsInspection(traces));assert.equal(needsStoredDpsInspection([{...traces[0],stage:'dps_lookup'}]),false);
 const report=durableFiscalReport(traces).join('\n');assert.match(report,/E0008: a SEFIN considerou dhEmi posterior/);assert.ok(!report.includes('PRIVATE_DATA'));
 const contract=JSON.parse(readFileSync(new URL('../integrations/nfse/contracts/sefin-homologation-v1.structural.json',import.meta.url),'utf8'));
 const lines=storedContractReport(contract).join('\n');assert.match(lines,/HTTP 400, HTTP 403/);assert.match(lines,/nem reclassifica esta operação/);
 assert.match(storedContractReport({private:'PRIVATE_DATA'}).join(''),/não reconhecido/);
});

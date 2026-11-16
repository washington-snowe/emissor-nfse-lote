import assert from 'node:assert/strict';
import {test} from 'node:test';
import {observedFiscalRequest,fiscalRequestTimeout,fiscalResponseObservation,fiscalCorrelation} from '../src/lib/nfse/transport-observation.ts';
import {fiscalOperationReport} from '../src/lib/nfse/operation-report.ts';
const secret='PRIVATE_BODY_CNPJ_11222333000181_PASSWORD_credential_url';
const id='00000000-0000-4000-8000-000000000001';
test('observação técnica mantém só categorias/códigos limitados e correlação, sem corpo/erro/identidade',async()=>{
 const events:Record<string,unknown>[]=[];let calls=0;
 const response={status:400,body:Buffer.from(JSON.stringify({tipoAmbiente:0,idDPS:secret,erros:[{codigo:'E0710',descricao:secret},{codigo:secret}]}))};
 assert.equal(await observedFiscalRequest({operationId:id,stage:'submit',timeoutMs:20000},async()=>{calls++;return response;},e=>events.push(e)),response);
 assert.equal(calls,1);assert.equal(events.length,2);assert.equal(events[1].http,400);assert.deepEqual(events[1].codes,['E0710']);
 assert.equal(events[0].correlation,fiscalCorrelation(id));assert.ok(!JSON.stringify(events).includes(secret));assert.ok(!JSON.stringify(events).includes(id));
 assert.deepEqual(fiscalResponseObservation(999,Buffer.from(`<html>${secret}</html>`)),{http:0,format:'html',environment:'missing',codes:[]});
});
test('timeout e falha do logger não repetem requisição nem transformam falha em sucesso',async()=>{
 let calls=0;const events:Record<string,unknown>[]=[];const error=Object.assign(new Error(secret),{code:'ETIMEDOUT'});
 await assert.rejects(observedFiscalRequest({operationId:id,stage:'submit',timeoutMs:17000},async()=>{calls++;throw error;},e=>events.push(e)),e=>e===error);
 assert.equal(calls,1);assert.equal(events[1].transport,'timeout');assert.ok(!JSON.stringify(events).includes(secret));
 const response={status:201,body:Buffer.from('{}')};
 assert.equal(await observedFiscalRequest({operationId:id,stage:'submit',timeoutMs:20000},async()=>{calls++;return response;},()=>{throw new Error(secret);}),response);assert.equal(calls,2);
});
test('prazo do POST cresce dentro do orçamento, preservando oito segundos para registrar o resultado',()=>{
 assert.equal(fiscalRequestTimeout('POST',45000),20000);assert.equal(fiscalRequestTimeout('POST',25000),17000);
 assert.equal(fiscalRequestTimeout('GET',45000),5000);assert.equal(fiscalRequestTimeout('POST',9000),1000);
 assert.equal(fiscalRequestTimeout('POST',NaN),1);assert.equal(fiscalRequestTimeout('POST',100),1);
});
test('relatório reconstrói intervalo auditado sem inferir timeout, rejeição ou autorização e omite dados livres',()=>{
 const operation={id,status:'uncertain',reason:'not_found',transmit_count:1,reconcile_attempts:2,created_at:'2026-11-15T10:00:00Z',updated_at:'2026-11-15T10:06:00Z'};
 const events=[{event:'fiscal.dispatch_started',created_at:'2026-11-15T10:00:00Z'},{event:'fiscal.uncertain',created_at:'2026-11-15T10:00:05.010Z'},{event:'fiscal.not_found',created_at:'2026-11-15T10:05:00Z'},{event:secret,created_at:secret}];
 const report=fiscalOperationReport(operation,events,secret);
 assert.match(report,/Intervalo entre início e primeiro resultado: 5 s/);assert.match(report,/Correlação técnica: [a-f0-9]{16}/);
 assert.match(report,/15\/11\/2026, 07:00:00 \(São Paulo\)/);
 assert.match(report,/não armazenado no histórico do banco/);assert.match(report,/Não consulta a SEFIN nem envia notas/);assert.ok(!report.includes(secret));assert.ok(!report.includes(id));
 const unknown=fiscalOperationReport({...operation,status:secret,reason:secret,created_at:secret,transmit_count:100},[]);
 assert.ok(!unknown.includes(secret));assert.match(unknown,/Intervalo entre início e primeiro resultado: indisponível/);
});

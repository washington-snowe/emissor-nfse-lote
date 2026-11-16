import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { identity, signedDps, nfseFixture, contractFixture } from "./helpers/fiscal-fixture.ts";
import { verifyOfficialNfseContents } from "../src/lib/nfse/receipt.ts";
import { supportedNfseContract, readCompressedNfse, definitiveRejection, dpsTransportBody } from "../src/lib/nfse/api-contract.ts";
import { validateFiscalSchema } from "../src/lib/nfse/schema.ts";
import {signDps} from '../src/lib/nfse/signature.ts';

test("adaptador condicional exige os campos e caminhos no contrato capturado, sem habilitar por mera presença de /nfse", () => {
  const contract = supportedNfseContract(contractFixture());
  assert.ok(contract);
  assert.equal(supportedNfseContract({ paths: { "/nfse": { post: {} } } }), null);
  const unknown = contractFixture();
  unknown.paths["/nfse"].post.parameters[0].schema.required.push("unimplementedMandatoryField");
  assert.equal(supportedNfseContract(unknown), null);
  assert.equal(definitiveRejection(400, { erros: [{ codigo: "E0001" }] }, contract), true);
  assert.equal(definitiveRejection(400, { erros: [{ codigo: "E0014" }] }, contract), false);
  assert.equal(definitiveRejection(503, { erros: [{ codigo: "E0001" }] }, contract), false);
  assert.equal(definitiveRejection(400, { arbitrary: "not proof" }, contract), false);
});
test("XML comprimido tem base64 canônico, limite de expansão e encoding UTF-8 válido", () => {
  assert.equal(readCompressedNfse(gzipSync(Buffer.from("<synthetic/>")).toString("base64")), "<synthetic/>");
  assert.equal(readCompressedNfse(gzipSync(Buffer.alloc(262145, "a")).toString("base64")), null);
  assert.equal(readCompressedNfse(gzipSync(Buffer.from([0xff])).toString("base64")), null);
  assert.equal(readCompressedNfse("AAAA\n"), null);
  const body = JSON.parse(dpsTransportBody("<synthetic/>").toString());
  assert.equal(readCompressedNfse(body.dpsXmlGZipB64), "<synthetic/>");
});

test('reconciliação conserva a assinatura/DPS original legada e não escolhe o schema pelo documento recebido',async()=>{
 const holder=identity(),service=identity(),current=signedDps(holder);
 const unsigned=current.xml.replace('<finNFSe>0</finNFSe>','').replace(/<Signature[\s\S]*<\/Signature>/,'');
 const legacy=signDps(unsigned,current.id,holder.privateKeyPem,holder.certificatePem),key='1'.repeat(50);
 const receipt=nfseFixture(legacy,service,key);
 const expected={dpsId:current.id,signedDps:legacy,holderCert:holder.certificatePem,issuerCnpj:'11222333000181',accessKey:key};
 assert.ok(await verifyOfficialNfseContents(receipt,expected),'legacy receipt remains verifiable against its pinned original');
 assert.equal(await verifyOfficialNfseContents(receipt,{...expected,signedDps:current.xml}),null,'incoming legacy XML cannot downgrade the new original layout');
});
test("recibo sintético exige XSD, chave, emitente, conteúdo original da DPS e assinatura íntegra da NFS-e", async () => {
  const holder = identity(), service = identity(), dps = signedDps(holder), key = "1".repeat(50);
  const xml = nfseFixture(dps.xml, service, key);
  assert.equal(await validateFiscalSchema(xml, "NFSe"), true);
  const expected = { dpsId: dps.id, signedDps: dps.xml, holderCert: holder.certificatePem, issuerCnpj: "11222333000181", accessKey: key };
  assert.ok(await verifyOfficialNfseContents(xml, expected));
  const returnedUnsignedDps = dps.xml.replace(/<Signature\b[\s\S]*?<\/Signature>/, "");
  assert.ok(await verifyOfficialNfseContents(nfseFixture(returnedUnsignedDps, service), expected));
  assert.equal(await verifyOfficialNfseContents(nfseFixture(returnedUnsignedDps.replace("<vServ>11.01", "<vServ>11.02"), service), expected), null);
  assert.equal(await verifyOfficialNfseContents(xml, { ...expected, accessKey: "2".repeat(50) }), null);
  assert.equal(await verifyOfficialNfseContents(xml, { ...expected, issuerCnpj: "11444777000161" }), null);
  assert.equal(await verifyOfficialNfseContents(xml.replace("<vLiq>11.01", "<vLiq>11.02"), expected), null);
  assert.equal(await verifyOfficialNfseContents(xml.replace("<vServ>11.01", "<vServ>11.02"), expected), null);
  assert.equal(await verifyOfficialNfseContents(nfseFixture(dps.xml, service, key, "103"), expected), null);
  const different = signedDps(holder);
  const differentXml = different.xml.replace("<vServ>11.01", "<vServ>11.02");
  assert.equal(await verifyOfficialNfseContents(nfseFixture(differentXml, service), expected), null);
});

test('rejeição é reconhecida pelo status/schema capturados, com 403 explícito e sem inferir por HTML ou duplicidade',async()=>{
  const {readFileSync}=await import('node:fs');
  const raw=JSON.parse(readFileSync(new URL('../integrations/nfse/contracts/sefin-homologation-v1.structural.json',import.meta.url),'utf8'));
  const contract=supportedNfseContract(raw)!;const id='DPS'+'1'.repeat(42),body={tipoAmbiente:2,idDPS:id,erros:[{codigo:'E0710'}]};
  assert.ok(definitiveRejection(403,body,contract,id));assert.ok(definitiveRejection(400,body,contract,id));
  assert.equal(definitiveRejection(422,body,contract,id),false,'undeclared status must not inherit another status schema');
  assert.equal(definitiveRejection(500,body,contract,id),false,'server failure remains uncertain even with a declared error schema');
  for(const candidate of [null,{message:'Forbidden'},{erros:[]},{erros:[{codigo:'E0014'}]},{erros:[{codigo:'E0710'},{codigo:'E0014'}]}, {...body,idDPS:'different'}, {...body,chaveAcesso:'1'.repeat(50)}, {...body,nfseXmlGZipB64:'ambiguous'}])
    assert.equal(definitiveRejection(403,candidate,contract,id),false);
  delete raw.paths['/nfse'].post.responses['403'];
  assert.equal(definitiveRejection(403,body,supportedNfseContract(raw)!,id),false,'403 needs its own captured response model');
});

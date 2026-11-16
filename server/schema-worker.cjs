"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const { validateXML } = require("xmllint-wasm");

// Only public XML and pinned schemas reach this isolated validator; never private keys/passwords.
validateXML({
  xml: workerData.xmls.map((contents, index) => ({ fileName: `document-${index}.xml`, contents })),
  schema: workerData.schema,
  preload: workerData.preload,
  initialMemoryPages: 256,
  maxMemoryPages: 1024,
  modifyArguments: args => ["--nonet", ...args],
}).then(result => {
  const fields=[];
  // Never post rawOutput: it can contain XML values, addresses or certificate contents.
  for(const match of (result.rawOutput||'').slice(0,65536).matchAll(/(?:element|attribute)\s+['"]([^'"\r\n]{1,220})['"]/gi)){
    const name=match[1].split(/[}:]/).at(-1);
    if(workerData.diagnosticFields.includes(name)&&!fields.includes(name))fields.push(name);
    if(fields.length===10)break;
  }
  parentPort.postMessage({ valid: result.valid, fields });
}, () => parentPort.postMessage({ failed: true }));

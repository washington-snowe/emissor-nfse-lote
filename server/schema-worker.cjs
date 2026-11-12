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
}).then(result => parentPort.postMessage({ valid: result.valid }), () => parentPort.postMessage({ failed: true }));

export async function limitedText(body: ReadableStream<Uint8Array>|null,limit:number) {
 if(!body) return "";
 const reader=body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try {for(;;){const result=await reader.read();if(result.done)break;length+=result.value.byteLength;if(length>limit){await reader.cancel();throw new Error("Body too large");}chunks.push(result.value);}}
 finally {reader.releaseLock();}
 const joined=new Uint8Array(length);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
 return new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(joined);
}

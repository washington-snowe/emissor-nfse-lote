// Public XML field names only; raw validation messages and values never leave this boundary.
export const SCHEMA_FIELDS=['DPS','infDPS','Id','versao','tpAmb','dhEmi','verAplic','serie','nDPS','dCompet','tpEmit','cLocEmi','prest','CNPJ','CPF','IM','fone','email','regTrib','opSimpNac','regApTribSN','regEspTrib','toma','xNome','end','endNac','cMun','CEP','xLgr','nro','xCpl','xBairro','serv','locPrest','cLocPrestacao','cServ','cTribNac','cTribMun','xDescServ','cNBS','valores','vServPrest','vServ','trib','tribMun','tribISSQN','tpRetISSQN','totTrib','indTotTrib','Signature','SignedInfo','CanonicalizationMethod','SignatureMethod','Reference','Transforms','Transform','DigestMethod','DigestValue','SignatureValue','KeyInfo','X509Data','X509Certificate'] as const;
export function schemaFieldsFromMessage(message:unknown):string[]{
 if(typeof message!=='string'||message.length>16384)return [];
 const found:string[]=[];
 for(const match of message.matchAll(/(?:element|attribute|elemento|atributo)\s+['"]([^'"\r\n]{1,220})['"]/gi)){
  const name=match[1].split(/[}:]/).at(-1)!;
  if(SCHEMA_FIELDS.some(field=>field===name)&&!found.includes(name))found.push(name);
  if(found.length===10)break;
 }
 return found;
}

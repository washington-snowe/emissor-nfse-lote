/** Protocol categories only. Do not export returned identifiers or normalize them for authorization. */
export function dpsIdentityReport(body:Record<string,unknown>|null,expected:string):string[]{
 const keys=['idDps','idDPS'].filter(key=>body&&Object.hasOwn(body,key));
 if(!keys.length)return ['Identidade no envelope da consulta: ausente.'];
 return keys.map(key=>{
  const value=body![key];let category='formato não reconhecido';
  if(value===null)category='nula';
  else if(value===expected)category='corresponde exatamente à DPS original';
  else if(value==='')category='texto vazio';
  else if(typeof value==='string'&&/^DPS\d{42}$/.test(expected)&&value===expected.slice(3))category='mesmos dígitos, sem o literal DPS';
  else if(typeof value==='string'&&value.trim()===expected)category='corresponde somente após remover espaços';
  else if(typeof value==='string'&&/^DPS\d{42}$/.test(expected)&&/^DPS\d{42}$/.test(value)){
   const parts=[['município',3,10],['tipo de inscrição',10,11],['inscrição',11,25],['série',25,30],['número',30,45]] as const;
   category='componentes diferentes: '+parts.filter(([,start,end])=>value.slice(start,end)!==expected.slice(start,end)).map(([name])=>name).join(', ');
  }else if(typeof value==='string'&&/^NFS\d{50}$/.test(value))category='formato de identidade de NFS-e';
  return `Campo ${key} na consulta: ${category}.`;
 });
}

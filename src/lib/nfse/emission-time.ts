import {validFiscalDate} from './dps.ts';

const formatter=new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',
 hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset',
});

/** Represent the current instant in the fiscal timezone. Never subtract an artificial safety interval. */
export function fiscalEmissionTime(now=Date.now()):string{
 if(!Number.isFinite(now))throw new Error('Fiscal clock unavailable');
 const parts=Object.fromEntries(formatter.formatToParts(now).map(part=>[part.type,part.value]));
 const offset=/^GMT([+-]\d{2}:00)$/.exec(parts.timeZoneName)?.[1];
 const result=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset??''}`;
 if(!offset||Date.parse(result)!==Math.floor(now/1000)*1000)throw new Error('Fiscal clock unavailable');
 return result;
}

/** Only timezone categories and a bounded delta leave the original XML boundary. */
export function emissionTimeReport(value:unknown,dispatchAt?:string):string[]{
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:00$/.test(value)||
  !validFiscalDate(value.slice(0,10))||!Number.isFinite(Date.parse(value)))return ['Horário dhEmi: formato não reconhecido.'];
 const offset=value.slice(-6);
 const lines=[`Fuso de dhEmi: ${offset==='+00:00'?'UTC (+00:00)':offset==='-03:00'?'São Paulo (-03:00)':'outro deslocamento explícito'}.`];
 const delta=Date.parse(value)-(dispatchAt?Date.parse(dispatchAt):NaN);
 lines.push(`dhEmi menos início de envio registrado: ${!Number.isFinite(delta)?'indisponível':Math.abs(delta)>86400000?'diferença superior a um dia':`${Math.round(delta/100)/10} s`}.`);
 lines.push('Essa comparação usa o registro local; não recupera o horário do primeiro processamento na SEFIN.');
 return lines;
}

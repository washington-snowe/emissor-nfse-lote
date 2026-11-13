import type {ParsedShopeeReport} from '../shopee-seller-csv.ts';
import type {ReviewGroup} from '../nfse/review.ts';
export type EmailRoute={email?:string;name?:string;reason?:'invalid_email'|'ambiguous_recipient'};
export function mailbox(value:unknown):string|null{
 if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))return null;
 const text=value.trim();
 if(text.length>254||!text.length||/[\s\x00-\x1f\x7f<>,;:"\\()[\]]/.test(text)||!/^[-A-Za-z0-9.!#$%&'*+\/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(text)||text.includes('..'))return null;
 const [local,domain]=text.split('@');if(local.length>64||domain.split('.').some(part=>!part.length||part.length>63||part.startsWith('-')||part.endsWith('-')))return null;
 return local+'@'+domain.toLowerCase();
}
export function sellerEmailRoute(report:ParsedShopeeReport,group:Pick<ReviewGroup,'sourceRows'>):EmailRoute{
 const rows=group.sourceRows;
 if(!Array.isArray(rows)||!rows.length||new Set(rows).size!==rows.length)return {reason:'ambiguous_recipient'};
 const sellers=rows.map(row=>report.reportedSellers.find(s=>s.location.row===row));
 if(sellers.some(s=>!s))return {reason:'ambiguous_recipient'};
 const emails=sellers.map(s=>mailbox(s!.email));if(emails.some(email=>!email))return {reason:'invalid_email'};
 const identities=new Set(sellers.map(s=>s!.storeId??'row:'+s!.location.row));
 if(new Set(emails.map(email=>email!.toLowerCase())).size!==1||identities.size!==1)return {reason:'ambiguous_recipient'};
 return {email:emails[0]!,name:sellers[0]!.storeName??sellers[0]!.legalName??'Vendedor'};
}

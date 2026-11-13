import {mailbox} from './routing.ts';
export const EMAIL_PROVIDERS=['brevo','sendpulse','mailjet'] as const;
export type EmailProvider=typeof EMAIL_PROVIDERS[number];
export function emailConfig(env:Record<string,string|undefined>){
 const providers:EmailProvider[]=[];
 if(env.BREVO_API_KEY)providers.push('brevo');
 if(env.SENDPULSE_CLIENT_ID&&env.SENDPULSE_CLIENT_SECRET)providers.push('sendpulse');
 if(env.MAILJET_API_KEY&&env.MAILJET_SECRET_KEY)providers.push('mailjet');
 const sender=mailbox(env.NFSE_EMAIL_FROM),testTo=mailbox(env.NFSE_EMAIL_TEST_TO);
 return {providers,sender,testTo,enabled:env.NFSE_EMAIL_ENABLED==='true'&&Boolean(sender)&&providers.length>0};
}

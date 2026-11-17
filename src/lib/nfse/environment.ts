export type FiscalEnvironment='homologation'|'production';
export function selectedFiscalEnvironment(env:Record<string,string|undefined>):FiscalEnvironment{
 return env.NFSE_PRODUCTION_ENABLED==='true'?'production':'homologation';
}
export function fiscalEnvironmentEnabled(environment:FiscalEnvironment,env:Record<string,string|undefined>){
 return env[environment==='production'?'NFSE_PRODUCTION_ENABLED':'NFSE_HOMOLOGATION_ENABLED']==='true';
}
export const fiscalEnvironmentLabel=(environment:FiscalEnvironment)=>environment==='production'?'produção':'homologação';

import { validCnpj } from "../companies.ts";
import { NFSE_BASES, nfseGet, type NfseCredentials } from "./http.ts";
import { supportedNfseContract, verifiedSefinLookup } from "./api-contract.ts";

export function ownSefinLookupId(municipality: string, cnpj: string, series: string) {
  if (!/^[1-9]\d{6}$/.test(municipality) || !/^\d{14}$/.test(cnpj) || !validCnpj(cnpj) ||
    !/^\d{1,5}$/.test(series) || BigInt(series) < 1n || BigInt(series) > 49999n) throw new Error("Invalid fiscal lookup identity.");
  // Existence query in the holder's actual configured namespace. No number is reserved or consumed.
  return `DPS${municipality}2${cnpj}${series.padStart(5, "0")}${"1".padStart(15, "0")}`;
}

export async function verifyOwnSefinTransport(input: { municipality: string; cnpj: string; holderCnpj: string; series: string }, credentials: NfseCredentials, rawContract: unknown, request = nfseGet) {
  if (input.cnpj !== input.holderCnpj) return false;
  const contract = supportedNfseContract(rawContract);
  if (!contract) return false;
  const id = ownSefinLookupId(input.municipality, input.cnpj, input.series);
  const url = NFSE_BASES.homologation + contract.dpsPath.replace(/\{[^}]+\}/, id);
  const response = await request("homologation", url, credentials, 5000);
  return verifiedSefinLookup(response.status, response.body, id, rawContract);
}

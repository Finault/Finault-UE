import { sha256 } from "../util/hash";
export function generateCloseId(payload:any){
  return "FIN-CL-" + sha256(JSON.stringify(payload)).slice(0,12).toUpperCase();
}

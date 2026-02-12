
import JSZip from "jszip";
export async function buildZip(files:any[]){
  const zip=new JSZip();
  for(const f of files) zip.file(f.name,f.data);
  return zip.generateAsync({type:"uint8array"});
}

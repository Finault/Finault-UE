import JSZip from "jszip";

export type Artifact = {
  name: string;
  bytes: Uint8Array;
};

export async function zipArtifacts(
  artifacts: Artifact[],
  manifest: object,
  closeId: string
): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const a of artifacts) {
    zip.file(a.name, a.bytes);
  }

  zip.file(
    `MANIFEST-${closeId}.json`,
    JSON.stringify(manifest, null, 2)
  );

  const buf = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  return buf;
}

import path from "node:path";
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBED_MODEL = "Xenova/multilingual-e5-small";

env.cacheDir = path.join(process.cwd(), ".cache", "models");

const g = globalThis as unknown as { __embedder?: Promise<FeatureExtractionPipeline> };

function getEmbedder(): Promise<FeatureExtractionPipeline> {
  g.__embedder ??= pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" }) as Promise<FeatureExtractionPipeline>;
  return g.__embedder;
}

// e5 models are trained with "query: " / "passage: " prefixes; omitting them hurts retrieval.
export async function embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
  const extractor = await getEmbedder();
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 16) {
    const batch = texts.slice(i, i + 16).map((t) => `${kind}: ${t}`);
    const tensor = await extractor(batch, { pooling: "mean", normalize: true });
    const dim = tensor.dims[1];
    const data = tensor.data as Float32Array;
    for (let j = 0; j < batch.length; j++) out.push(data.slice(j * dim, (j + 1) * dim));
  }
  return out;
}

export function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function fromBlob(b: Buffer): Float32Array {
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

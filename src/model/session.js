import * as ort from "onnxruntime-web/wasm";
import { buildSequence, renderOptions, toInternal } from "./sequence.js";
import { formatAnswer, softmax, temperatureFor } from "./postprocess.js";
import { loadTokenizer } from "./tokenizer.js";

export const MODEL_REVISION = "a1f49ac3c927b2e694a074af081d043adaa0fda1";
export const MODEL_BASE = `https://huggingface.co/nvkudva/laya-web-q8/resolve/${MODEL_REVISION}/v1`;
const CACHE_NAME = `laya-weights-${MODEL_REVISION.slice(0, 12)}`;
const HASHES = {
  "encoder_q8.onnx": "5267b578a536bf12808ec84c1f354e87efd150d3c38d44099ef3dd29c5f43124",
  "encoder_q8.onnx.data": "6375a3ae8f3ebfa4ca196e813fc7bdaf2e8ad8cf709218ef844ae8814dfffc59",
  "head_q8.onnx": "e86c14c89a18b14f6115a7ccbfd039fce7ff97178fa0c07c14af936690a1f688",
  "head_q8.onnx.data": "cfdf7c199378b07758c69f58935871cf517c97c29914328d4b11fcfbe50b7f8b"
};

const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
async function verify(file, bytes) {
  const expected = HASHES[file];
  if (!expected) return;
  const actual = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (actual !== expected) throw new Error(`Integrity check failed for ${file}`);
}

async function fetchCached(url, onProgress) {
  const file = url.split("/").pop();
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(url);
  if (hit) {
    const bytes = new Uint8Array(await hit.arrayBuffer());
    await verify(file, bytes);
    onProgress?.({ file, loaded: bytes.length, total: bytes.length, cached: true, phase: "verified" });
    return bytes;
  }
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`${file} download failed: ${response.status}`);
  const total = Number(response.headers.get("content-length") || 0);
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({ file, loaded, total, cached: false, phase: "downloading" });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  onProgress?.({ file, loaded, total: loaded, cached: false, phase: "verifying" });
  await verify(file, bytes);
  await cache.put(url, new Response(bytes, { headers: { "content-length": String(bytes.length) } }));
  return bytes;
}

export async function deleteModelCache() {
  await caches.delete(CACHE_NAME);
}

export async function cachedModelBytes() {
  const cache = await caches.open(CACHE_NAME);
  let bytes = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (response) bytes += Number(response.headers.get("content-length") || (await response.blob()).size);
  }
  return bytes;
}

export class LayaSession {
  constructor(config, tokenizer, encoder, head) {
    this.config = config;
    this.tokenizer = tokenizer;
    this.encoder = encoder;
    this.head = head;
  }

  static async load(onProgress) {
    ort.env.wasm.wasmPaths = chrome.runtime.getURL("ort/");
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 8);
    const [config, tokenizer] = await Promise.all([
      fetch(`${MODEL_BASE}/rl_agent_config.json`).then((response) => response.json()),
      loadTokenizer(MODEL_BASE)
    ]);
    const create = async (name) => {
      const graph = await fetchCached(`${MODEL_BASE}/${name}.onnx`, onProgress);
      const data = await fetchCached(`${MODEL_BASE}/${name}.onnx.data`, onProgress);
      return ort.InferenceSession.create(graph, {
        executionProviders: ["wasm"],
        externalData: [{ data, path: `${name}.onnx.data` }]
      });
    };
    return new LayaSession(config, tokenizer, await create("encoder_q8"), await create("head_q8"));
  }

  async systemOne(state, questions) {
    const answers = {};
    const typeIds = { choice: 0, score: 1, noul: 2 };
    for (const [id, definition] of Object.entries(questions)) {
      const question = toInternal(definition);
      const optionCount = renderOptions(question).length;
      const { ids, markers } = buildSequence(this.tokenizer, state, question, this.config.max_len, this.config.head_max_len);
      if (markers.length !== optionCount) throw new Error(`Options for ${id} exceed the model head length`);
      const length = ids.length;
      const attention = new ort.Tensor("int64", new BigInt64Array(length).fill(1n), [1, length]);
      const { hidden } = await this.encoder.run({
        input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, length]),
        attention_mask: attention
      });
      const result = await this.head.run({
        hidden,
        attention_mask: attention,
        marker_pos: new ort.Tensor("int64", BigInt64Array.from(markers, BigInt), [1, markers.length]),
        marker_mask: new ort.Tensor("bool", new Uint8Array(markers.length).fill(1), [1, markers.length]),
        qtype: new ort.Tensor("int64", BigInt64Array.from([typeIds[question.t]], BigInt), [1])
      });
      const logits = Array.from(result.logits.data).slice(0, optionCount);
      const temperature = temperatureFor(this.config, typeIds[question.t], optionCount);
      const probabilities = softmax(logits.map((value) => value / temperature));
      const act = softmax(Array.from(result.act_logits.data));
      answers[id] = formatAnswer(question, probabilities, act[0]);
    }
    return answers;
  }
}
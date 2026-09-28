import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-web/wasm";
import { PreTrainedTokenizer } from "@huggingface/transformers";
import { buildSequence, renderOptions, toInternal } from "../src/model/sequence.js";
import { formatAnswer, softmax, temperatureFor } from "../src/model/postprocess.js";

const modelDirectory = process.env.LAYA_MODEL_DIR;
if (!modelDirectory) throw new Error("Set LAYA_MODEL_DIR to the downloaded model v1 directory");

const root = path.dirname(fileURLToPath(import.meta.url));
ort.env.wasm.wasmPaths = `${path.resolve(root, "../node_modules/onnxruntime-web/dist")}/`;
ort.env.wasm.numThreads = 1;

const json = async (name) => JSON.parse(await readFile(path.join(modelDirectory, name), "utf8"));
const [config, tokenizerJson, tokenizerConfig] = await Promise.all([
  json("rl_agent_config.json"), json("tokenizer.json"), json("tokenizer_config.json")
]);
const tokenizerInstance = new PreTrainedTokenizer(tokenizerJson, tokenizerConfig);
const special = (text) => tokenizerInstance.encode(text, { add_special_tokens: false })[0];
const tokenizer = {
  encode: (text, options) => tokenizerInstance.encode(text, options),
  maskToken: "[MASK]",
  maskTokenId: special("[MASK]"),
  clsTokenId: special("[CLS]"),
  sepTokenId: special("[SEP]"),
  padTokenId: special("[PAD]")
};

const create = async (name) => {
  const [graph, data] = await Promise.all([
    readFile(path.join(modelDirectory, `${name}.onnx`)),
    readFile(path.join(modelDirectory, `${name}.onnx.data`))
  ]);
  return ort.InferenceSession.create(new Uint8Array(graph), {
    executionProviders: ["wasm"],
    externalData: [{ data: new Uint8Array(data), path: `${name}.onnx.data` }]
  });
};

console.log("Loading encoder and decision head…");
const [encoder, head] = await Promise.all([create("encoder_q8"), create("head_q8")]);
const question = toInternal({
  type: "choice",
  instructions: "Classify the overall page risk.",
  criteria: ["safe", "suspicious", "high risk", "insufficient evidence"]
});
const { ids, markers } = buildSequence(tokenizer, {
  page: { domain: "openai-account-support.xyz", url: "http://openai-account-support.xyz/login" },
  relevant_text: "Security alert. Verify your account immediately. Confirm your password.",
  forms: [{ asksForPassword: true, action: "http://collector.example/submit" }]
}, question, config.max_len, config.head_max_len);
if (markers.length !== renderOptions(question).length) throw new Error("Model sequence lost decision markers");

const length = ids.length;
const attention = new ort.Tensor("int64", new BigInt64Array(length).fill(1n), [1, length]);
const { hidden } = await encoder.run({
  input_ids: new ort.Tensor("int64", BigInt64Array.from(ids, BigInt), [1, length]),
  attention_mask: attention
});
const result = await head.run({
  hidden,
  attention_mask: attention,
  marker_pos: new ort.Tensor("int64", BigInt64Array.from(markers, BigInt), [1, markers.length]),
  marker_mask: new ort.Tensor("bool", new Uint8Array(markers.length).fill(1), [1, markers.length]),
  qtype: new ort.Tensor("int64", BigInt64Array.from([0n]), [1])
});
const logits = Array.from(result.logits.data).slice(0, markers.length);
const probabilities = softmax(logits.map((value) => value / temperatureFor(config, 0, markers.length)));
const answer = formatAnswer(question, probabilities, 0);
if (!answer.choice || probabilities.some((value) => !Number.isFinite(value))) throw new Error("Invalid model output");
console.log(JSON.stringify({ tokens: length, answer }, null, 2));
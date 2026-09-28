import { PreTrainedTokenizer } from "@huggingface/transformers";

export async function loadTokenizer(base) {
  const [tokenizerJson, tokenizerConfig] = await Promise.all([
    fetch(`${base}/tokenizer.json`).then((response) => {
      if (!response.ok) throw new Error(`Tokenizer download failed: ${response.status}`);
      return response.json();
    }),
    fetch(`${base}/tokenizer_config.json`).then((response) => {
      if (!response.ok) throw new Error(`Tokenizer config download failed: ${response.status}`);
      return response.json();
    })
  ]);
  const tokenizer = new PreTrainedTokenizer(tokenizerJson, tokenizerConfig);
  const specialId = (text) => {
    const ids = tokenizer.encode(text, { add_special_tokens: false });
    if (ids.length !== 1) throw new Error(`${text} did not map to one token`);
    return ids[0];
  };
  return {
    encode: (text, options) => tokenizer.encode(text, options),
    maskToken: "[MASK]",
    maskTokenId: specialId("[MASK]"),
    clsTokenId: specialId("[CLS]"),
    sepTokenId: specialId("[SEP]"),
    padTokenId: specialId("[PAD]")
  };
}
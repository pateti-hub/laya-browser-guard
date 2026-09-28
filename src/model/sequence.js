export function pyJsonDumps(value, ensureAscii) {
  const escape = (text) => {
    let output = '"';
    for (const character of text) {
      const code = character.codePointAt(0);
      if (character === '"') output += '\\"';
      else if (character === "\\") output += "\\\\";
      else if (character === "\n") output += "\\n";
      else if (character === "\r") output += "\\r";
      else if (character === "\t") output += "\\t";
      else if (code < 0x20) output += `\\u${code.toString(16).padStart(4, "0")}`;
      else if (ensureAscii && code > 0x7f) {
        if (code > 0xffff) {
          const pair = code - 0x10000;
          output += `\\u${(0xd800 + (pair >> 10)).toString(16).padStart(4, "0")}`;
          output += `\\u${(0xdc00 + (pair & 0x3ff)).toString(16).padStart(4, "0")}`;
        } else output += `\\u${code.toString(16).padStart(4, "0")}`;
      } else output += character;
    }
    return `${output}"`;
  };
  const serialize = (item) => {
    if (item === null || item === undefined) return "null";
    if (typeof item === "string") return escape(item);
    if (typeof item === "boolean") return item ? "true" : "false";
    if (typeof item === "number") return String(item);
    if (Array.isArray(item)) return `[${item.map(serialize).join(", ")}]`;
    return `{${Object.entries(item).map(([key, entry]) => `${escape(key)}: ${serialize(entry)}`).join(", ")}}`;
  };
  return serialize(value);
}

export function toInternal(question) {
  let criteria = question.criteria ?? null;
  if (question.type === "choice" && Array.isArray(criteria)) {
    criteria = Object.fromEntries(criteria.map((value) => [value, null]));
  }
  const instructions = typeof question.instructions === "string"
    ? question.instructions
    : pyJsonDumps(question.instructions, true);
  return { t: question.type, ins: instructions, crit: criteria };
}

export function renderOptions(question) {
  if (question.t === "choice") {
    return Object.entries(question.crit ?? {}).map(([key, value]) => value ? `${key}: ${value}` : key);
  }
  if (question.t === "score") return question.crit.map((value, index) => `level ${index}: ${value}`);
  const criteria = question.crit ?? {};
  return [
    `false: ${criteria.false || "no, the statement does not hold"}`,
    `true: ${criteria.true || "yes, the statement holds"}`
  ];
}

export function buildSequence(tokenizer, state, question, maxLength, headMaxLength, truncateLeft = false) {
  const scrub = (text) => text.split(tokenizer.maskToken).join(" ");
  const options = renderOptions(question);
  let headIds = tokenizer.encode(`${question.t} question: ${scrub(String(question.ins))}`, { add_special_tokens: false });
  let optionIds = options.map((option) => [
    tokenizer.maskTokenId,
    ...tokenizer.encode(` ${scrub(option)}`, { add_special_tokens: false }).slice(0, 48)
  ]);
  let budget = headMaxLength - optionIds.reduce((sum, ids) => sum + ids.length, 0);
  if (budget < 16) {
    const each = Math.max(4, Math.floor((headMaxLength - 16) / Math.max(1, optionIds.length)));
    optionIds = optionIds.map((ids) => ids.slice(0, each));
    budget = headMaxLength - optionIds.reduce((sum, ids) => sum + ids.length, 0);
  }
  headIds = headIds.slice(0, Math.max(8, budget));
  const ids = [tokenizer.clsTokenId, ...headIds, tokenizer.sepTokenId];
  const markers = [];
  for (const option of optionIds) {
    markers.push(ids.length);
    ids.push(...option);
  }
  ids.push(tokenizer.sepTokenId);
  const room = Math.max(0, maxLength - ids.length - 1);
  const stateText = typeof state === "string" ? state : pyJsonDumps(state, false);
  const allStateIds = tokenizer.encode(scrub(stateText), { add_special_tokens: false });
  const stateIds = truncateLeft ? (room === 0 ? allStateIds : allStateIds.slice(-room)) : allStateIds.slice(0, room);
  return { ids: [...ids, ...stateIds, tokenizer.sepTokenId].slice(0, maxLength), markers: markers.filter((position) => position < maxLength) };
}
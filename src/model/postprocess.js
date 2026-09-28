const TYPES = ["choice", "score", "noul"];
export const softmax = (values) => {
  const maximum = Math.max(...values);
  const exponents = values.map((value) => Math.exp(value - maximum));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return exponents.map((value) => value / total);
};
export const temperatureFor = (config, type, options) => {
  const size = options <= 2 ? "2" : options <= 5 ? "3-5" : options <= 10 ? "6-10" : "11+";
  return config.temperature_by_options[`${TYPES[type]}:${size}`] ?? config.temperature[type];
};
const rounded = (value) => Math.round(value * 10000) / 10000;
export function formatAnswer(question, probabilities, actProbability) {
  const maximum = probabilities.indexOf(Math.max(...probabilities));
  if (question.t === "choice") {
    const keys = Object.keys(question.crit ?? {});
    return { type: "choice", choice: keys[maximum], probabilities: Object.fromEntries(keys.map((key, i) => [key, rounded(probabilities[i])])) };
  }
  if (question.t === "score") {
    return { type: "score", score: rounded(probabilities.reduce((sum, value, i) => sum + i * value, 0)), probabilities: Object.fromEntries(probabilities.map((value, i) => [String(i), rounded(value)])) };
  }
  return { type: "noul", noul: rounded(probabilities[1]), act_probability: actProbability };
}
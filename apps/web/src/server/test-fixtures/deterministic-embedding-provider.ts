import type { EmbeddingProvider } from "../analysis/embedding-provider";

// Test-only deterministic stand-in for a multilingual embedding model. Production composition never
// imports this module.
//
// A lexical shingle metric cannot express "same meaning, different words", so a fake that merely
// re-implements token overlap would make the semantic tests vacuous. Instead this provider projects
// text onto a small concept space: surface words are mapped to the concept they express, so two
// paraphrases of the same idea land close together while unrelated projects land far apart. It is
// deterministic, needs no network, and is not a semantic model — only a fixture with the property
// the tests need to be meaningful.
const CONCEPT_LEXICON: Record<string, readonly string[]> = {
  agriculture: [
    "tarım",
    "tarımsal",
    "çiftçi",
    "çiftçiye",
    "bitki",
    "yaprak",
    "ürün",
    "hasat",
    "tarla",
    "zirai",
    "sera",
    "mahsul",
  ],
  disease: ["hastalık", "hastalığı", "enfeksiyon", "patojen", "zararlı", "küf", "leke", "teşhis"],
  vision: ["görüntü", "görüntüleri", "kamera", "fotoğraf", "imge", "optik", "görsel", "piksel"],
  machineLearning: [
    "yapay",
    "zekâ",
    "zeka",
    "öğrenme",
    "sinir",
    "ağı",
    "model",
    "modeli",
    "algoritma",
    "evrişimli",
    "sınıflandırma",
    "sınıflandırılır",
    "eğitim",
  ],
  detection: ["tespit", "algılama", "saptama", "uyarı", "erken", "tanıma", "belirleme"],
  energy: ["enerji", "rüzgâr", "rüzgar", "türbin", "güneş", "panel", "batarya", "elektrik"],
  mechanical: [
    "mekanik",
    "donanım",
    "yatak",
    "rulman",
    "damper",
    "titreşim",
    "sönümleyici",
    "kanat",
    "döküm",
    "yay",
  ],
  maintenance: ["bakım", "arıza", "ömrünü", "duruş", "onarım", "aşınma"],
};

const CONCEPT_KEYS = Object.keys(CONCEPT_LEXICON).sort();

const WORD_TO_CONCEPTS = new Map<string, string[]>();
for (const concept of CONCEPT_KEYS) {
  for (const word of CONCEPT_LEXICON[concept] ?? []) {
    const existing = WORD_TO_CONCEPTS.get(word) ?? [];
    existing.push(concept);
    WORD_TO_CONCEPTS.set(word, existing);
  }
}

/** Dimensions: one per concept, plus a residual bucket so wholly unknown text is not the zero vector. */
export const DETERMINISTIC_EMBEDDING_DIMENSIONS = CONCEPT_KEYS.length + 1;

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

/** Stable non-negative bucket for tokens outside the concept lexicon. */
function residualWeight(token: string): number {
  let hash = 0;
  for (const character of token) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 9973;
  return 0.05 + (hash % 100) / 4000;
}

export function deterministicEmbedding(text: string): number[] {
  const vector = new Array<number>(DETERMINISTIC_EMBEDDING_DIMENSIONS).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const concepts = WORD_TO_CONCEPTS.get(token);
    if (!concepts) {
      const residualIndex = DETERMINISTIC_EMBEDDING_DIMENSIONS - 1;
      vector[residualIndex] = (vector[residualIndex] ?? 0) + residualWeight(token);
      continue;
    }
    for (const concept of concepts) {
      const index = CONCEPT_KEYS.indexOf(concept);
      if (index >= 0) vector[index] = (vector[index] ?? 0) + 1;
    }
  }
  const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(first: readonly number[], second: readonly number[]): number {
  let dot = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const a = first[index] ?? 0;
    const b = second[index] ?? 0;
    dot += a * b;
    firstNorm += a * a;
    secondNorm += b * b;
  }
  if (firstNorm === 0 || secondNorm === 0) return 0;
  return dot / (Math.sqrt(firstNorm) * Math.sqrt(secondNorm));
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = DETERMINISTIC_EMBEDDING_DIMENSIONS;
  #calls = 0;
  #embeddedTexts = 0;

  async embed(texts: readonly string[]): Promise<number[][]> {
    this.#calls += 1;
    this.#embeddedTexts += texts.length;
    return texts.map((text) => deterministicEmbedding(text));
  }

  callCount(): number {
    return this.#calls;
  }

  embeddedTextCount(): number {
    return this.#embeddedTexts;
  }
}

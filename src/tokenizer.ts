import { encode } from "gpt-tokenizer/encoding/o200k_base";

export function estimateTokens(content: string): number {
  return encode(content).length;
}

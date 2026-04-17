import Replicate from "replicate";

let client: Replicate | null = null;

export function getReplicate(): Replicate {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not set");
  }
  if (!client) {
    client = new Replicate({ auth: token });
  }
  return client;
}

// Pinned version — see research note. meta/sam-2 auto-mask mode.
// Do not change without verifying input/output schema.
export const SAM2_MODEL =
  "meta/sam-2:fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83";

export type Sam2Output = {
  combined_mask: string;
  individual_masks: string[];
};

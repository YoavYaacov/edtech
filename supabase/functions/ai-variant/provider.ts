// Provider-agnostic contract. The handler knows ONLY this; a new provider = a new adapter returning the same VariantResult.
import type { Expectation, VariantResult } from "./schema.ts";
import type { VariantPayload } from "./context.ts";

export interface VariantProvider {
  provider: string; // stored in ai_variant_runs.provider
  model: string;    // stored in ai_variant_runs.model
  proposeVariant(input: VariantPayload, expect: Expectation): Promise<VariantResult>; // validated, or throws VariantError
}

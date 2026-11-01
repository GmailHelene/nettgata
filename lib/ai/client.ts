import type Anthropic from "@anthropic-ai/sdk";

/**
 * Det AI-teamet trenger fra Anthropic. Testene bytter den ut med en falsk (setAiClientForTests),
 * så ingen test bruker nettverket eller koster penger.
 */
export interface AiClient {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  createBatch(requests: Anthropic.Messages.BatchCreateParams.Request[]): Promise<{ id: string }>;
  /** «ended» når alle svarene er klare. */
  batchStatus(batchId: string): Promise<string>;
  batchResults(batchId: string): Promise<AsyncIterable<Anthropic.Messages.MessageBatchIndividualResponse>>;
}

const shared = globalThis as { __aiClient?: AiClient | null };

export function setAiClientForTests(client: AiClient | null) {
  shared.__aiClient = client;
}

/** null når ANTHROPIC_API_KEY ikke er lagt inn. Da er AI-teamet av, og studioet sier fra. */
export async function getAiClient(): Promise<AiClient | null> {
  if (shared.__aiClient !== undefined) return shared.__aiClient;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const sdk = new Anthropic({ apiKey });
  return {
    // Strømming hindrer tidsavbrudd når svaret tar tid. finalMessage() gir hele svaret.
    create: (params) => sdk.messages.stream(params).finalMessage(),
    createBatch: (requests) => sdk.messages.batches.create({ requests }),
    batchStatus: async (id) => (await sdk.messages.batches.retrieve(id)).processing_status,
    batchResults: (id) => sdk.messages.batches.results(id),
  };
}

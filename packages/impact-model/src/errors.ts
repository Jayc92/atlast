export class ImpactEngineInputError extends Error {
  readonly code = "INVALID_IMPACT_ENGINE_INPUT" as const;

  constructor(message: string) {
    super(`Invalid impact engine input: ${message}`);
    this.name = "ImpactEngineInputError";
  }
}

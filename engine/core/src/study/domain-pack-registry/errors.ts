export class DomainPackRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainPackRegistryError";
    this.code = code;
  }
}

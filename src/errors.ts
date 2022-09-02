export class MissingConfiguration extends Error {
  constructor(key: string, value: string) {
    super(`Missing configuration for ${key}: ${value}`);
    Object.setPrototypeOf(this, MissingConfiguration.prototype);
  }
}

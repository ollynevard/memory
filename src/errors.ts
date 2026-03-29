export class DuplicateThoughtError extends Error {
  constructor(
    message = "This thought is too similar to an existing memory. Not stored.",
  ) {
    super(message);
    this.name = "DuplicateThoughtError";
  }
}

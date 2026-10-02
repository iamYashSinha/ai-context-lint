export class RetryPolicy {
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
}

import { PaymentClient } from "./PaymentClient.js";
import { RetryPolicy } from "./RetryPolicy.js";

export class PaymentService {
  private client = new PaymentClient();
  private retry = new RetryPolicy();

  async processPayment(amount: number) {
    return this.retry.execute(() =>
      this.client.charge(amount)
    );
  }
}

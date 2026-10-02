import { HttpClient } from "../http/HttpClient.js";

export class PaymentClient {
  private http = new HttpClient();

  async charge(amount: number) {
    return this.http.post("/payments", { amount });
  }
}

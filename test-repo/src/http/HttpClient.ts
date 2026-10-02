export class HttpClient {
  private baseUrl = "https://api.example.com";

  async get(url: string) {
    return this.request("GET", url);
  }

  async post(url: string, body: unknown) {
    return this.request("POST", url, body);
  }

  async put(url: string, body: unknown) {
    return this.request("PUT", url, body);
  }

  async delete(url: string) {
    return this.request("DELETE", url);
  }

  private async request(
    method: string,
    url: string,
    body?: unknown
  ) {
    const fullUrl = `${this.baseUrl}${url}`;

    console.log("HTTP request");
    console.log("method:", method);
    console.log("url:", fullUrl);
    console.log("body:", body);

    return {
      status: 200,
      data: body,
    };
  }
}
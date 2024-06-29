import { BackendServerHealth } from "./enum";
import axios from "axios";
export interface IBackendServerDetails {
  url: string;
  count: number;
  /*
        Reset number of requests per server
    */
  resetCount(): void;
  /*
        increments number of requests per server
    */
  incrementCount(): number;
  /*
        Send request to a URL and responds
        with a status code
    */
  ping(): Promise<number>;

  setStatus(status: BackendServerHealth): void;

  getStatus(): BackendServerHealth;
}

export class BackendServerDetails implements IBackendServerDetails {
  url: string;
  count: number;
  private status: BackendServerHealth;
  private pingURL;
  private controller;

  constructor(
    url: string,
    controller: AbortController,
    status?: BackendServerHealth
  ) {
    this.url = url;
    this.count = 0;
    this.controller = controller;
    this.pingURL = url + "ping";
    this.status = status ?? BackendServerHealth.UNHEALTHY;
  }

  public resetCount(): void {
    this.count = 0;
    return;
  }
  public incrementCount(): number {
    this.count++;
    return this.count;
  }
  public async ping(): Promise<number> {
    try {
      const response = await axios.get(this.pingURL, {
        signal: this.controller.signal,
      });
      return response.status;
    } catch (error) {
      return 500;
    }
  }
  public setStatus(status: BackendServerHealth): void {
    this.status = status;
    return;
  }
  public getStatus(): BackendServerHealth {
    return this.status;
  }
}

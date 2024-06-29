import axios from "axios";
import { IncomingMessage, Server, ServerResponse } from "http";
import { BackendServerHealth, SchedulingAlgorithm } from "./enum";
import { BackendServerDetails, IBackendServerDetails } from "./be-details";
import express = require("express");

export interface ILoadBalancerServer {
  server: Server<typeof IncomingMessage, typeof ServerResponse>;
  algo: SchedulingAlgorithm;
  backendServers: IBackendServerDetails[];
  healthCheckDurationInSeconds: number;
  getServer(): Server<typeof IncomingMessage, typeof ServerResponse>;
  closeServer(): Server<typeof IncomingMessage, typeof ServerResponse>;
  startHealthCheck(): void;
  stopHealthCheck(): void;
  performHealthCheck(): Promise<void>;
}

export class LoadBalancerServer implements ILoadBalancerServer {
  private indexOfServer = 0;
  private port;
  private backendServerUrls = [
    "http://localhost:8081/",
    "http://localhost:8082/",
    "http://localhost:8083/",
  ];
  server;
  algo;
  backendServers;
  healthCheckDurationInSeconds;
  private healthCheckTimer!: NodeJS.Timer;
  private healthyServers: Array<IBackendServerDetails>;
  private controller: AbortController;

  constructor(
    port: number = 80,
    algo: SchedulingAlgorithm,
    healthCheckDurationInSeconds: number
  ) {
    this.healthyServers = new Array<IBackendServerDetails>();
    this.backendServers = new Array<IBackendServerDetails>();
    this.algo = algo;
    this.port = port;
    this.healthCheckDurationInSeconds = healthCheckDurationInSeconds;
    this.controller = new AbortController();
    this.backendServerUrls.forEach((url) => {
      const backendServer = new BackendServerDetails(url, this.controller);
      this.backendServers.push(backendServer);
    });

    const app = express();

    app.use(express.text());
    app.use(express.json());

    app.get("/", async (req, res) => {
      const backendServer = this.getBackendServer();
      if (this.healthyServers.length === 0) {
        res.sendStatus(500);
      } else {
        this.indexOfServer =
          (this.indexOfServer + 1) % this.healthyServers.length;
        try {
          const response = await axios.get(backendServer.url);
          backendServer.incrementCount();
          res.status(200).send(response.data);
        } catch (err) {
          console.error(err);
          res.sendStatus(500);
        }
      }
    });
    this.performInitialHealthCheck();

    this.server = app
      .listen(this.port, () => {
        console.log("LB Server listening on port " + this.port);
      })
      .on("error", (err: any) => {
        if (
          err.message.toString().indexOf("EADDRINUSE") ||
          err.message.toString().indexOf("EACCES")
        ) {
          this.port = 4000;
          this.server = app.listen(this.port, () => {
            console.log("LB Server listening on port " + this.port);
          });
        }
      });

    this.startHealthCheck();
  }

  private getBackendServer(): IBackendServerDetails {
    switch (this.algo) {
      case SchedulingAlgorithm.ROUND_ROBIN:
        return this.healthyServers[
          this.indexOfServer % this.healthyServers.length
        ];
    }
  }
  public getServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
    return this.server;
  }
  public closeServer(): Server<typeof IncomingMessage, typeof ServerResponse> {
    this.stopHealthCheck();
    this.controller.abort();
    const server = this.server.close();
    console.log("Closed LoadBalancer Server");
    this.printBackendStats();
    return server;
  }
  public startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.healthCheckDurationInSeconds * 1000);
  }
  public stopHealthCheck(): void {
    clearInterval(this.healthCheckDurationInSeconds);
  }

  public async performHealthCheck(): Promise<void> {
    // Create Tasks for async operations
    /*
    Create Tasks for Async Operations: It initializes an array tasks and iterates through this.backendServers, 
    calling the ping() method on each server. ping() 
    likely returns a Promise that resolves to an HTTP status code (e.g., 200 for success).
     */
    const tasks = [];
    for (let i = 0; i < this.backendServers.length; i++) {
      tasks.push(this.backendServers[i].ping());
    }

    // Wait for tasks to complete
    await Promise.all(tasks).then((values) => {
      for (let i = 0; i < values.length; i++) {
        const oldStatus = this.backendServers[i].getStatus();
        /*
        If a server responds with 200 (success):
            It checks and updates the server's health status (HEALTHY or UNHEALTHY).
            It manages the list of healthyServers, ensuring unique entries and resetting counts if necessary.
        If a server does not respond with 200:
            It updates the server's health status (HEALTHY or UNHEALTHY).
            It removes the server from healthyServers if it was previously listed as healthy
         */
        if (values[i] === 200) {
          if (oldStatus !== BackendServerHealth.HEALTHY) {
            this.backendServers[i].setStatus(BackendServerHealth.HEALTHY);
          }
          if (
            this.healthyServers
              .map((server) => server.url)
              .indexOf(this.backendServers[i].url) < 0
          ) {
            this.backendServers[i].resetCount();
            this.healthyServers.push(this.backendServers[i]);
          }
        } else {
          if (oldStatus !== BackendServerHealth.UNHEALTHY) {
            this.backendServers[i].setStatus(BackendServerHealth.UNHEALTHY);
          }
          const index = this.healthyServers
            .map((server) => server.url)
            .indexOf(this.backendServers[i].url);
          if (index >= 0) {
            this.healthyServers.splice(index, 1);
          }
        }
      }
    });
    console.log(
      `Completed Health Check. Total backend servers online: ${this.healthyServers.length}`
    );
  }
  private printBackendStats(): void {
    const status: [string, number, string][] = [];
    this.backendServers.forEach((server) => {
      status.push([
        server.url,
        server.count,
        BackendServerHealth[server.getStatus()],
      ]);
    });
    console.log(status);
  }
  private performInitialHealthCheck(): void {
    const initialHealthCheckPromises = this.backendServers.map((server) =>
      server.ping()
    );
    Promise.all(initialHealthCheckPromises)
      .then((results) => {
        results.forEach((value, index) => {
          if (value === 200) {
            this.backendServers[index].setStatus(BackendServerHealth.HEALTHY);
            this.healthyServers.push(this.backendServers[index]);
          } else {
            this.backendServers[index].setStatus(BackendServerHealth.UNHEALTHY);
          }
        });
        console.log(
          `Initial Health Check completed. Found ${this.healthyServers.length} healthy servers.`
        );
      })
      .catch((error) => {
        console.error("Error during initial health check:", error);
      });
  }
}

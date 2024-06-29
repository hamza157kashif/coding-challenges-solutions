import { SchedulingAlgorithm } from "./enum";
import { LoadBalancerServer } from "./lb";

try {
  const port = parseInt(process.argv[2]);
  new LoadBalancerServer(port, SchedulingAlgorithm.ROUND_ROBIN, 10 * 1000);
} catch (err) {
  console.error("Invalid port provided");
  process.exit(1);
}

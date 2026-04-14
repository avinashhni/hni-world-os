export interface NodeHealth {
  nodeId: string;
  region: string;
  cpuLoad: number;
  memoryLoad: number;
  healthy: boolean;
}

export interface LoadBalancingReadiness {
  strategy: "least_connections" | "weighted_round_robin";
  stickySessions: boolean;
  autoscalingEnabled: boolean;
  healthyNodes: number;
  totalNodes: number;
  failoverReady: boolean;
}

export class LoadBalancingReadinessService {
  evaluate(nodes: NodeHealth[]): LoadBalancingReadiness {
    const healthyNodes = nodes.filter((node) => node.healthy).length;
    const avgCpu = nodes.reduce((sum, node) => sum + node.cpuLoad, 0) / Math.max(nodes.length, 1);

    return {
      strategy: avgCpu > 0.7 ? "least_connections" : "weighted_round_robin",
      stickySessions: false,
      autoscalingEnabled: true,
      healthyNodes,
      totalNodes: nodes.length,
      failoverReady: healthyNodes >= Math.ceil(nodes.length / 2),
    };
  }
}

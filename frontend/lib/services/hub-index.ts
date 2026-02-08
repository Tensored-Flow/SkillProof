import { HubService } from "./hub-types";
import { hubMockService } from "./hub-mock";
import { hubContractService } from "./hub-contract";

export function getHubService(demoMode: boolean): HubService {
  return demoMode ? hubMockService : hubContractService;
}

export type { HubService, Proposal, Market, Bounty, LeaderboardEntry, AggregateScore } from "./hub-types";

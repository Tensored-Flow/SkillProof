export interface Proposal {
  id: number;
  description: string;
  deadline: number;
  yesWeight: number;
  noWeight: number;
  executed: boolean;
  proposer: string;
}

export interface Market {
  id: number;
  question: string;
  feedId: string;
  targetPrice: bigint;
  commitDeadline: number;
  revealDeadline: number;
  resolved: boolean;
  actualPrice: bigint;
  creator: string;
}

export interface Bounty {
  id: number;
  description: string;
  poster: string;
  reward: string;
  commitDeadline: number;
  deadline: number;
  awarded: boolean;
  winner: string;
}

export interface LeaderboardEntry {
  address: string;
  playerName: string;
  overallElo: number;
  effectiveElo: number;
  reputationBonus: number;
  percentile: number;
  issuer: string;
  totalMatches: number;
  winRate: number;
  skillDomains: string[];
}

export interface AggregateScore {
  compositeElo: number;
  compositePercentile: number;
  totalMatches: number;
  issuerCount: number;
  domainCount: number;
  crossDomainBonus: number;
  overallScore: number;
}

export interface HubService {
  // Vault
  deposit(amount: string): Promise<{ txHash: string }>;
  withdraw(amount: string): Promise<{ txHash: string }>;
  getVaultBalance(): Promise<string>;
  getUserVaultBalance(address: string): Promise<string>;

  // Govern
  createProposal(description: string, deadlineTimestamp: number): Promise<{ txHash: string; proposalId: number }>;
  vote(proposalId: number, support: boolean): Promise<{ txHash: string }>;
  getProposal(proposalId: number): Promise<Proposal>;
  getProposalCount(): Promise<number>;
  hasVoted(proposalId: number, address: string): Promise<boolean>;

  // Predict
  createMarket(
    question: string,
    feedId: string,
    targetPrice: bigint,
    commitDeadline: number,
    revealDeadline: number,
  ): Promise<{ txHash: string; marketId: number }>;
  commitPrediction(marketId: number, prediction: boolean, salt: string): Promise<{ txHash: string }>;
  revealPrediction(marketId: number, prediction: boolean, salt: string): Promise<{ txHash: string }>;
  resolveMarket(marketId: number): Promise<{ txHash: string }>;
  getMarket(marketId: number): Promise<Market>;
  getMarketCount(): Promise<number>;

  // Arena
  postBounty(
    description: string,
    commitDeadline: number,
    deadline: number,
    rewardAmount: string,
  ): Promise<{ txHash: string; bountyId: number }>;
  commitSolution(bountyId: number, solution: string, salt: string): Promise<{ txHash: string }>;
  revealSolution(bountyId: number, solution: string, salt: string): Promise<{ txHash: string }>;
  awardBounty(bountyId: number, winner: string): Promise<{ txHash: string }>;
  getBounty(bountyId: number): Promise<Bounty>;
  getBountyCount(): Promise<number>;

  // Reputation
  getEffectiveElo(address: string): Promise<number>;
  getReputation(address: string): Promise<number>;
  getEffectiveVotingPower(address: string): Promise<number>;

  // Leaderboard
  getLeaderboardData(): Promise<LeaderboardEntry[]>;

  // ZK Verification
  getZKVerificationCount(): Promise<number>;
  isZKVerified(address: string): Promise<boolean>;
  getZKVerifiedThreshold(address: string): Promise<number>;

  // Decay
  getDecayMultiplier(address: string): Promise<number>;
  getDecayedElo(address: string): Promise<number>;
  getDaysSinceUpdate(address: string): Promise<number>;

  // Aggregator
  getAggregateScore(address: string): Promise<AggregateScore>;
}

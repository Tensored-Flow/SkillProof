import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatEther, solidityPackedKeccak256, encodeBytes32String } from "ethers";
import { HubService, Proposal, Market, Bounty, LeaderboardEntry, AggregateScore } from "./hub-types";

const HUB_ADDRESS = "0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3";
const REGISTRY_ADDRESS = "0xa855e8E15C9F350438065D19a73565ea1A23E33A";
const ZK_VERIFIER_ADDRESS = "0x0F46334167e68C489DE6B65D488F9d64624Bc270";
const DECAY_ADDRESS = "0x20d0A539e0A49991876CDb2004FeA41AFE1C089E";
const AGGREGATOR_ADDRESS = "0x919473044Dde9b3eb69161C4a35eFfb995a234bB";
const COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc";

const ZK_VERIFIER_ABI = [
  "function zkVerificationCount() view returns (uint256)",
  "function zkVerifiedAboveThreshold(address) view returns (bool)",
  "function zkVerifiedThreshold(address) view returns (uint256)",
];

const DECAY_ABI = [
  "function getDecayMultiplier(address) view returns (uint256)",
  "function getDecayedElo(address) view returns (uint256)",
  "function getDaysSinceUpdate(address) view returns (uint256)",
];

const AGGREGATOR_ABI = [
  "function getAggregateScore(address) view returns (tuple(uint256 compositeElo, uint256 compositePercentile, uint256 totalMatches, uint256 issuerCount, uint256 domainCount, uint256 crossDomainBonus, uint256 overallScore))",
];

const REGISTRY_ABI = [
  "function getCredential(address player) view returns (tuple(string playerName, uint256 overallElo, uint256 percentile, string[] skillDomains, uint256[] skillScores, uint256[] skillPercentiles, uint256 totalMatches, uint256 winRate, address issuer, uint256 issuedAt, bool isValid))",
  "function hasCredential(address player) view returns (bool)",
  "function issuers(address) view returns (string name, bool isActive)",
];

const HUB_ABI = [
  // Vault
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function getVaultBalance() external view returns (uint256)",
  "function balances(address) external view returns (uint256)",
  "function vaultEloThreshold() external view returns (uint256)",
  // Govern
  "function createProposal(string description, uint256 deadline) external",
  "function vote(uint256 proposalId, bool support) external",
  "function getProposal(uint256 proposalId) external view returns (tuple(uint256 id, string description, uint256 deadline, uint256 yesWeight, uint256 noWeight, bool executed, address proposer))",
  "function proposalCount() external view returns (uint256)",
  "function hasVoted(uint256, address) external view returns (bool)",
  // Predict
  "function createMarket(string question, bytes21 feedId, int256 targetPrice, uint256 commitDeadline, uint256 revealDeadline) external",
  "function commitPrediction(uint256 marketId, bytes32 commitHash) external",
  "function revealPrediction(uint256 marketId, bool prediction, bytes32 salt) external",
  "function resolveMarket(uint256 marketId) external",
  "function markets(uint256) external view returns (uint256 id, string question, bytes21 feedId, int256 targetPrice, uint256 commitDeadline, uint256 revealDeadline, bool resolved, int256 actualPrice, address creator)",
  "function marketCount() external view returns (uint256)",
  // Arena
  "function postBounty(string description, uint256 commitDeadline, uint256 deadline) external payable",
  "function commitSolution(uint256 bountyId, bytes32 commitHash) external",
  "function revealSolution(uint256 bountyId, string solution, bytes32 salt) external",
  "function awardBounty(uint256 bountyId, address winner) external",
  "function bounties(uint256) external view returns (uint256 id, string description, address poster, uint256 reward, uint256 deadline, uint256 commitDeadline, bool awarded, address winner)",
  "function bountyCount() external view returns (uint256)",
  // Reputation
  "function reputationBonus(address) external view returns (int256)",
  "function getEffectiveElo(address user) external view returns (uint256)",
  "function getEffectiveVotingPower(address user) external view returns (uint256)",
  "function getReputation(address user) external view returns (int256)",
  "function getParticipant(uint256 index) external view returns (address)",
  "function participantCount() external view returns (uint256)",
  "function getLeaderboard(uint256 start, uint256 count) external view returns (address[])",
  "function isParticipant(address) external view returns (bool)",
];

function getReadProvider() {
  return new JsonRpcProvider(COSTON2_RPC);
}

async function getSignerAndContract() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum;
  if (typeof window === "undefined" || !eth) {
    throw new Error("MetaMask not found — connect your wallet first");
  }
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const hub = new Contract(HUB_ADDRESS, HUB_ABI, signer);
  return { hub, signer };
}

function getReadContract() {
  const provider = getReadProvider();
  return new Contract(HUB_ADDRESS, HUB_ABI, provider);
}

function getRegistryReadContract() {
  const provider = getReadProvider();
  return new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
}

export const hubContractService: HubService = {
  // ── Vault ──────────────────────────────────────────────────────────────────

  async deposit(amount: string) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.deposit({ value: parseEther(amount) });
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async withdraw(amount: string) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.withdraw(parseEther(amount));
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async getVaultBalance() {
    const hub = getReadContract();
    const bal = await hub.getVaultBalance();
    return formatEther(bal);
  },

  async getUserVaultBalance(address: string) {
    const hub = getReadContract();
    const bal = await hub.balances(address);
    return formatEther(bal);
  },

  // ── Govern ─────────────────────────────────────────────────────────────────

  async createProposal(description: string, deadlineTimestamp: number) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.createProposal(description, deadlineTimestamp);
    const receipt = await tx.wait();
    // Parse proposalId from logs if needed; use proposalCount - 1 as fallback
    const count = await hub.proposalCount();
    return { txHash: receipt.hash, proposalId: Number(count) - 1 };
  },

  async vote(proposalId: number, support: boolean) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.vote(proposalId, support);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async getProposal(proposalId: number): Promise<Proposal> {
    const hub = getReadContract();
    const p = await hub.getProposal(proposalId);
    return {
      id: Number(p.id),
      description: p.description,
      deadline: Number(p.deadline),
      yesWeight: Number(p.yesWeight),
      noWeight: Number(p.noWeight),
      executed: p.executed,
      proposer: p.proposer,
    };
  },

  async getProposalCount() {
    const hub = getReadContract();
    return Number(await hub.proposalCount());
  },

  async hasVoted(proposalId: number, address: string) {
    const hub = getReadContract();
    return await hub.hasVoted(proposalId, address);
  },

  // ── Predict ────────────────────────────────────────────────────────────────

  async createMarket(
    question: string,
    feedId: string,
    targetPrice: bigint,
    commitDeadline: number,
    revealDeadline: number,
  ) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.createMarket(question, feedId, targetPrice, commitDeadline, revealDeadline);
    const receipt = await tx.wait();
    const count = await hub.marketCount();
    return { txHash: receipt.hash, marketId: Number(count) - 1 };
  },

  async commitPrediction(marketId: number, prediction: boolean, salt: string) {
    const { hub } = await getSignerAndContract();
    const commitHash = solidityPackedKeccak256(
      ["bool", "bytes32"],
      [prediction, encodeBytes32String(salt)]
    );
    const tx = await hub.commitPrediction(marketId, commitHash);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async revealPrediction(marketId: number, prediction: boolean, salt: string) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.revealPrediction(marketId, prediction, encodeBytes32String(salt));
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async resolveMarket(marketId: number) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.resolveMarket(marketId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async getMarket(marketId: number): Promise<Market> {
    const hub = getReadContract();
    const m = await hub.markets(marketId);
    return {
      id: Number(m.id),
      question: m.question,
      feedId: m.feedId,
      targetPrice: BigInt(m.targetPrice),
      commitDeadline: Number(m.commitDeadline),
      revealDeadline: Number(m.revealDeadline),
      resolved: m.resolved,
      actualPrice: BigInt(m.actualPrice),
      creator: m.creator,
    };
  },

  async getMarketCount() {
    const hub = getReadContract();
    return Number(await hub.marketCount());
  },

  // ── Arena ──────────────────────────────────────────────────────────────────

  async postBounty(
    description: string,
    commitDeadline: number,
    deadline: number,
    rewardAmount: string,
  ) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.postBounty(description, commitDeadline, deadline, {
      value: parseEther(rewardAmount),
    });
    const receipt = await tx.wait();
    const count = await hub.bountyCount();
    return { txHash: receipt.hash, bountyId: Number(count) - 1 };
  },

  async commitSolution(bountyId: number, solution: string, salt: string) {
    const { hub } = await getSignerAndContract();
    const commitHash = solidityPackedKeccak256(
      ["string", "bytes32"],
      [solution, encodeBytes32String(salt)]
    );
    const tx = await hub.commitSolution(bountyId, commitHash);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async revealSolution(bountyId: number, solution: string, salt: string) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.revealSolution(bountyId, solution, encodeBytes32String(salt));
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async awardBounty(bountyId: number, winner: string) {
    const { hub } = await getSignerAndContract();
    const tx = await hub.awardBounty(bountyId, winner);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  },

  async getBounty(bountyId: number): Promise<Bounty> {
    const hub = getReadContract();
    const b = await hub.bounties(bountyId);
    return {
      id: Number(b.id),
      description: b.description,
      poster: b.poster,
      reward: formatEther(b.reward),
      commitDeadline: Number(b.commitDeadline),
      deadline: Number(b.deadline),
      awarded: b.awarded,
      winner: b.winner,
    };
  },

  async getBountyCount() {
    const hub = getReadContract();
    return Number(await hub.bountyCount());
  },

  // ── Reputation ───────────────────────────────────────────────────────────

  async getEffectiveElo(address: string) {
    const hub = getReadContract();
    return Number(await hub.getEffectiveElo(address));
  },

  async getReputation(address: string) {
    const hub = getReadContract();
    return Number(await hub.getReputation(address));
  },

  async getEffectiveVotingPower(address: string) {
    const hub = getReadContract();
    return Number(await hub.getEffectiveVotingPower(address));
  },

  async getLeaderboardData(): Promise<LeaderboardEntry[]> {
    const hub = getReadContract();
    const registry = getRegistryReadContract();

    // Get all Hub participants
    const count = Number(await hub.participantCount());
    const addresses: string[] = [];
    if (count > 0) {
      // Fetch up to 100 participants
      const limit = Math.min(count, 100);
      for (let i = 0; i < limit; i++) {
        const addr = await hub.getParticipant(i);
        addresses.push(addr);
      }
    }

    // Also include known seeded addresses that may not be Hub participants
    const knownAddresses = [
      "0xDa8E6FDe5A8eA532d77160a4118A566EDC7543d2", // deployer
      "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Leon Wang (localhost)
      "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Alex Chen (localhost)
      "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // Maria Rodriguez
      "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // Raj Patel
    ];
    for (const addr of knownAddresses) {
      if (!addresses.includes(addr)) addresses.push(addr);
    }

    // Fetch credential + reputation data for each
    const entries: LeaderboardEntry[] = [];
    for (const addr of addresses) {
      try {
        const hasCred = await registry.hasCredential(addr);
        if (!hasCred) continue;

        const cred = await registry.getCredential(addr);
        if (!cred.isValid) continue;

        const effectiveElo = Number(await hub.getEffectiveElo(addr));
        const rep = Number(await hub.getReputation(addr));

        // Resolve issuer name
        let issuerName = addr.slice(0, 6) + "...";
        try {
          const issuer = await registry.issuers(cred.issuer);
          if (issuer.name) issuerName = issuer.name;
        } catch { /* fallback to truncated address */ }

        entries.push({
          address: addr,
          playerName: cred.playerName,
          overallElo: Number(cred.overallElo),
          effectiveElo,
          reputationBonus: rep,
          percentile: Number(cred.percentile),
          issuer: issuerName,
          totalMatches: Number(cred.totalMatches),
          winRate: Number(cred.winRate),
          skillDomains: [...cred.skillDomains],
        });
      } catch {
        // Skip addresses that fail to read
      }
    }

    return entries.sort((a, b) => b.effectiveElo - a.effectiveElo);
  },

  // ── ZK Verification ──────────────────────────────────────────────────────

  async getZKVerificationCount() {
    const provider = getReadProvider();
    const zk = new Contract(ZK_VERIFIER_ADDRESS, ZK_VERIFIER_ABI, provider);
    return Number(await zk.zkVerificationCount());
  },

  async isZKVerified(address: string) {
    const provider = getReadProvider();
    const zk = new Contract(ZK_VERIFIER_ADDRESS, ZK_VERIFIER_ABI, provider);
    return await zk.zkVerifiedAboveThreshold(address);
  },

  async getZKVerifiedThreshold(address: string) {
    const provider = getReadProvider();
    const zk = new Contract(ZK_VERIFIER_ADDRESS, ZK_VERIFIER_ABI, provider);
    return Number(await zk.zkVerifiedThreshold(address));
  },

  // ── Decay ────────────────────────────────────────────────────────────────

  async getDecayMultiplier(address: string) {
    const provider = getReadProvider();
    const decay = new Contract(DECAY_ADDRESS, DECAY_ABI, provider);
    return Number(await decay.getDecayMultiplier(address));
  },

  async getDecayedElo(address: string) {
    const provider = getReadProvider();
    const decay = new Contract(DECAY_ADDRESS, DECAY_ABI, provider);
    return Number(await decay.getDecayedElo(address));
  },

  async getDaysSinceUpdate(address: string) {
    const provider = getReadProvider();
    const decay = new Contract(DECAY_ADDRESS, DECAY_ABI, provider);
    return Number(await decay.getDaysSinceUpdate(address));
  },

  // ── Aggregator ───────────────────────────────────────────────────────────

  async getAggregateScore(address: string): Promise<AggregateScore> {
    const provider = getReadProvider();
    const agg = new Contract(AGGREGATOR_ADDRESS, AGGREGATOR_ABI, provider);
    const score = await agg.getAggregateScore(address);
    return {
      compositeElo: Number(score.compositeElo),
      compositePercentile: Number(score.compositePercentile),
      totalMatches: Number(score.totalMatches),
      issuerCount: Number(score.issuerCount),
      domainCount: Number(score.domainCount),
      crossDomainBonus: Number(score.crossDomainBonus),
      overallScore: Number(score.overallScore),
    };
  },
};

import { HubService, Proposal, Market, Bounty, LeaderboardEntry, AggregateScore } from "./hub-types";

const STORAGE_KEY = "skillproof_hub";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomHex = (len: number) =>
  "0x" +
  Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");

interface HubState {
  vaultTotal: string;
  userBalances: Record<string, string>;
  proposals: Proposal[];
  votes: Record<string, Record<string, boolean>>; // proposalId -> address -> voted
  markets: Market[];
  predictions: Record<string, Record<string, { prediction: boolean; salt: string; revealed: boolean }>>;
  bounties: Bounty[];
  solutions: Record<string, Record<string, { solution: string; salt: string; revealed: boolean }>>;
}

const DEMO_STATE: HubState = {
  vaultTotal: "1.0",
  userBalances: {},
  proposals: [
    {
      id: 0,
      description: "Should SkillProof integrate with Aave for skill-gated lending?",
      deadline: Math.floor(Date.now() / 1000) + 86400 * 3,
      yesWeight: 88,
      noWeight: 0,
      executed: false,
      proposer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    },
  ],
  votes: {},
  markets: [
    {
      id: 0,
      question: "Will FLR exceed $1.00 USD by end of Q1 2026?",
      feedId: "0x01464c522f55534400000000000000000000000000",
      targetPrice: BigInt(100000),
      commitDeadline: Math.floor(Date.now() / 1000) + 86400,
      revealDeadline: Math.floor(Date.now() / 1000) + 86400 * 2,
      resolved: false,
      actualPrice: BigInt(0),
      creator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    },
    {
      id: 1,
      question: "Will BTC exceed $100,000 USD?",
      feedId: "0x014254432f55534400000000000000000000000000",
      targetPrice: BigInt(10000000000),
      commitDeadline: Math.floor(Date.now() / 1000) + 86400,
      revealDeadline: Math.floor(Date.now() / 1000) + 86400 * 2,
      resolved: false,
      actualPrice: BigInt(0),
      creator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    },
    {
      id: 2,
      question: "Will ETH exceed $4,000 USD?",
      feedId: "0x014554482f55534400000000000000000000000000",
      targetPrice: BigInt(400000000),
      commitDeadline: Math.floor(Date.now() / 1000) + 86400,
      revealDeadline: Math.floor(Date.now() / 1000) + 86400 * 2,
      resolved: false,
      actualPrice: BigInt(0),
      creator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    },
  ],
  predictions: {},
  bounties: [
    {
      id: 0,
      description: "Build a SkillProof SDK for JavaScript developers",
      poster: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      reward: "0.5",
      commitDeadline: Math.floor(Date.now() / 1000) + 86400,
      deadline: Math.floor(Date.now() / 1000) + 86400 * 3,
      awarded: false,
      winner: "0x0000000000000000000000000000000000000000",
    },
  ],
  solutions: {},
};

function loadState(): HubState {
  if (typeof window === "undefined") return { ...DEMO_STATE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEMO_STATE };
    const parsed = JSON.parse(raw);
    // Restore bigint fields
    if (parsed.markets) {
      parsed.markets = parsed.markets.map((m: Record<string, unknown>) => ({
        ...m,
        targetPrice: BigInt(m.targetPrice as string),
        actualPrice: BigInt(m.actualPrice as string),
      }));
    }
    return parsed;
  } catch {
    return { ...DEMO_STATE };
  }
}

function saveState(state: HubState) {
  if (typeof window === "undefined") return;
  // Serialize bigint fields
  const serializable = {
    ...state,
    markets: state.markets.map((m) => ({
      ...m,
      targetPrice: m.targetPrice.toString(),
      actualPrice: m.actualPrice.toString(),
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

export const hubMockService: HubService = {
  // ── Vault ──────────────────────────────────────────────────────────────────

  async deposit(amount: string) {
    await delay(1500);
    const state = loadState();
    state.vaultTotal = (parseFloat(state.vaultTotal) + parseFloat(amount)).toString();
    state.userBalances["mock-user"] = (
      parseFloat(state.userBalances["mock-user"] || "0") + parseFloat(amount)
    ).toString();
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async withdraw(amount: string) {
    await delay(1500);
    const state = loadState();
    const bal = parseFloat(state.userBalances["mock-user"] || "0");
    if (bal < parseFloat(amount)) throw new Error("Insufficient balance");
    state.userBalances["mock-user"] = (bal - parseFloat(amount)).toString();
    state.vaultTotal = (parseFloat(state.vaultTotal) - parseFloat(amount)).toString();
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async getVaultBalance() {
    await delay(500);
    const state = loadState();
    return state.vaultTotal;
  },

  async getUserVaultBalance(address: string) {
    await delay(500);
    const state = loadState();
    return state.userBalances[address] || state.userBalances["mock-user"] || "0";
  },

  // ── Govern ─────────────────────────────────────────────────────────────────

  async createProposal(description: string, deadlineTimestamp: number) {
    await delay(1500);
    const state = loadState();
    const id = state.proposals.length;
    state.proposals.push({
      id,
      description,
      deadline: deadlineTimestamp,
      yesWeight: 0,
      noWeight: 0,
      executed: false,
      proposer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    });
    saveState(state);
    return { txHash: randomHex(32), proposalId: id };
  },

  async vote(proposalId: number, support: boolean) {
    await delay(1500);
    const state = loadState();
    const p = state.proposals[proposalId];
    if (!p) throw new Error("Proposal does not exist");
    const key = proposalId.toString();
    if (!state.votes[key]) state.votes[key] = {};
    if (state.votes[key]["mock-user"]) throw new Error("Already voted");
    state.votes[key]["mock-user"] = true;
    const weight = 95; // demo percentile
    if (support) {
      p.yesWeight += weight;
    } else {
      p.noWeight += weight;
    }
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async getProposal(proposalId: number) {
    await delay(500);
    const state = loadState();
    const p = state.proposals[proposalId];
    if (!p) throw new Error("Proposal does not exist");
    return p;
  },

  async getProposalCount() {
    await delay(300);
    return loadState().proposals.length;
  },

  async hasVoted(proposalId: number, _address: string) {
    await delay(300);
    const state = loadState();
    return state.votes[proposalId.toString()]?.["mock-user"] || false;
  },

  // ── Predict ────────────────────────────────────────────────────────────────

  async createMarket(
    question: string,
    feedId: string,
    targetPrice: bigint,
    commitDeadline: number,
    revealDeadline: number,
  ) {
    await delay(1500);
    const state = loadState();
    const id = state.markets.length;
    state.markets.push({
      id,
      question,
      feedId,
      targetPrice,
      commitDeadline,
      revealDeadline,
      resolved: false,
      actualPrice: BigInt(0),
      creator: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    });
    saveState(state);
    return { txHash: randomHex(32), marketId: id };
  },

  async commitPrediction(marketId: number, prediction: boolean, salt: string) {
    await delay(1500);
    const state = loadState();
    const key = marketId.toString();
    if (!state.predictions[key]) state.predictions[key] = {};
    state.predictions[key]["mock-user"] = { prediction, salt, revealed: false };
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async revealPrediction(marketId: number, prediction: boolean, salt: string) {
    await delay(1500);
    const state = loadState();
    const key = marketId.toString();
    const entry = state.predictions[key]?.["mock-user"];
    if (!entry) throw new Error("No commitment found");
    if (entry.prediction !== prediction || entry.salt !== salt) throw new Error("Hash mismatch");
    entry.revealed = true;
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async resolveMarket(marketId: number) {
    await delay(2000);
    const state = loadState();
    const m = state.markets[marketId];
    if (!m) throw new Error("Market does not exist");
    if (m.resolved) throw new Error("Already resolved");
    m.resolved = true;
    m.actualPrice = BigInt(95397); // simulated FLR/USD price
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async getMarket(marketId: number) {
    await delay(500);
    const state = loadState();
    const m = state.markets[marketId];
    if (!m) throw new Error("Market does not exist");
    return m;
  },

  async getMarketCount() {
    await delay(300);
    return loadState().markets.length;
  },

  // ── Arena ──────────────────────────────────────────────────────────────────

  async postBounty(
    description: string,
    commitDeadline: number,
    deadline: number,
    rewardAmount: string,
  ) {
    await delay(1500);
    const state = loadState();
    const id = state.bounties.length;
    state.bounties.push({
      id,
      description,
      poster: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      reward: rewardAmount,
      commitDeadline,
      deadline,
      awarded: false,
      winner: "0x0000000000000000000000000000000000000000",
    });
    saveState(state);
    return { txHash: randomHex(32), bountyId: id };
  },

  async commitSolution(bountyId: number, solution: string, salt: string) {
    await delay(1500);
    const state = loadState();
    const key = bountyId.toString();
    if (!state.solutions[key]) state.solutions[key] = {};
    state.solutions[key]["mock-user"] = { solution, salt, revealed: false };
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async revealSolution(bountyId: number, solution: string, salt: string) {
    await delay(1500);
    const state = loadState();
    const key = bountyId.toString();
    const entry = state.solutions[key]?.["mock-user"];
    if (!entry) throw new Error("No commitment found");
    if (entry.solution !== solution || entry.salt !== salt) throw new Error("Hash mismatch");
    entry.revealed = true;
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async awardBounty(bountyId: number, winner: string) {
    await delay(1500);
    const state = loadState();
    const b = state.bounties[bountyId];
    if (!b) throw new Error("Bounty does not exist");
    if (b.awarded) throw new Error("Already awarded");
    b.awarded = true;
    b.winner = winner;
    saveState(state);
    return { txHash: randomHex(32) };
  },

  async getBounty(bountyId: number) {
    await delay(500);
    const state = loadState();
    const b = state.bounties[bountyId];
    if (!b) throw new Error("Bounty does not exist");
    return b;
  },

  async getBountyCount() {
    await delay(300);
    return loadState().bounties.length;
  },

  // ── Reputation ──────────────────────────────────────────────────────────

  async getEffectiveElo(_address: string) {
    await delay(300);
    return 1857; // 1847 base + 10 rep
  },

  async getReputation(_address: string) {
    await delay(300);
    return 10;
  },

  async getEffectiveVotingPower(_address: string) {
    await delay(300);
    return 97; // 96 base + 10/10 = 97
  },

  async getLeaderboardData(): Promise<LeaderboardEntry[]> {
    await delay(800);
    const entries: LeaderboardEntry[] = [
      {
        address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
        playerName: "Maria Rodriguez",
        overallElo: 2105,
        effectiveElo: 2120,
        reputationBonus: 15,
        percentile: 99,
        issuer: "ChessArena",
        totalMatches: 312,
        winRate: 74,
        skillDomains: ["opening-theory", "endgame", "tactics", "positional-play"],
      },
      {
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        playerName: "Leon Wang",
        overallElo: 1847,
        effectiveElo: 1857,
        reputationBonus: 10,
        percentile: 96,
        issuer: "FinCraft",
        totalMatches: 342,
        winRate: 64,
        skillDomains: ["Options Pricing", "Statistical Arbitrage", "Risk Management", "Portfolio Optimization", "Market Microstructure"],
      },
      {
        address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        playerName: "Alex Chen",
        overallElo: 1623,
        effectiveElo: 1623,
        reputationBonus: 0,
        percentile: 74,
        issuer: "FinCraft",
        totalMatches: 187,
        winRate: 58,
        skillDomains: ["Options Pricing", "Statistical Arbitrage", "Risk Management", "Portfolio Optimization", "Market Microstructure"],
      },
      {
        address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
        playerName: "Raj Patel",
        overallElo: 1456,
        effectiveElo: 1451,
        reputationBonus: -5,
        percentile: 58,
        issuer: "ChessArena",
        totalMatches: 87,
        winRate: 51,
        skillDomains: ["opening-theory", "tactics", "blitz"],
      },
    ];
    return entries.sort((a, b) => b.effectiveElo - a.effectiveElo);
  },

  // ── ZK Verification ──────────────────────────────────────────────────────

  async getZKVerificationCount() {
    await delay(300);
    return 3;
  },

  async isZKVerified(_address: string) {
    await delay(300);
    return true;
  },

  async getZKVerifiedThreshold(_address: string) {
    await delay(300);
    return 1500;
  },

  // ── Decay ────────────────────────────────────────────────────────────────

  async getDecayMultiplier(_address: string) {
    await delay(300);
    return 9800; // 98%
  },

  async getDecayedElo(_address: string) {
    await delay(300);
    return 1810;
  },

  async getDaysSinceUpdate(_address: string) {
    await delay(300);
    return 2;
  },

  // ── Aggregator ───────────────────────────────────────────────────────────

  async getAggregateScore(_address: string): Promise<AggregateScore> {
    await delay(300);
    return {
      compositeElo: 1735,
      compositePercentile: 85,
      totalMatches: 529,
      issuerCount: 2,
      domainCount: 9,
      crossDomainBonus: 50,
      overallScore: 1785,
    };
  },
};

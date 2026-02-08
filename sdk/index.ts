import { ethers } from "ethers";

// Import ABIs
import RegistryABI from "../lib/abi.json";
import AttestorABI from "../lib/attestor-abi.json";
import HubABI from "../lib/hub-abi.json";
import VerifierABI from "../lib/verifier-abi.json";
import ZKVerifierABI from "../lib/zk-verifier-abi.json";
import ZKWrapperABI from "../lib/zk-wrapper-abi.json";
import DecayABI from "../lib/decay-abi.json";
import AggregatorABI from "../lib/aggregator-abi.json";

// Default Coston2 addresses
const COSTON2_ADDRESSES = {
  registry: "0xa855e8E15C9F350438065D19a73565ea1A23E33A",
  attestor: "0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4",
  hub: "0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3",
  verifier: "0xBEFded5454c7b3E16f1Db888e8280793735B866b",
  groth16: "0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664",
  zkVerifier: "0x0F46334167e68C489DE6B65D488F9d64624Bc270",
  decay: "0x20d0A539e0A49991876CDb2004FeA41AFE1C089E",
  aggregator: "0x919473044Dde9b3eb69161C4a35eFfb995a234bB",
};

export interface SkillCredential {
  issuer: string;
  playerName: string;
  overallElo: number;
  percentile: number;
  totalMatches: number;
  winRate: number;
  domains: string[];
  skillScores: number[];
  skillPercentiles: number[];
  timestamp: number;
  isValid: boolean;
}

export interface SkillGateConfig {
  minElo?: number;
  minPercentile?: number;
  requiredDomains?: string[];
  useDecayedElo?: boolean;
  useEffectiveElo?: boolean;
}

export interface GateResult {
  passed: boolean;
  reason?: string;
  elo: number;
  percentile: number;
  domains: string[];
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

export interface ProtocolStats {
  merkleVerifications: number;
  zkVerifications: number;
  totalMarkets: number;
  totalBounties: number;
  totalProposals: number;
  totalParticipants: number;
}

export class SkillProof {
  private provider: ethers.Provider;
  private registry: ethers.Contract;
  private hub: ethers.Contract;
  private verifier: ethers.Contract;
  private zkWrapper: ethers.Contract;
  private decay: ethers.Contract;
  private aggregator: ethers.Contract;
  private addresses: typeof COSTON2_ADDRESSES;

  constructor(
    providerOrUrl: ethers.Provider | string,
    addresses?: Partial<typeof COSTON2_ADDRESSES>
  ) {
    this.provider =
      typeof providerOrUrl === "string"
        ? new ethers.JsonRpcProvider(providerOrUrl)
        : providerOrUrl;

    this.addresses = { ...COSTON2_ADDRESSES, ...addresses };

    this.registry = new ethers.Contract(this.addresses.registry, RegistryABI, this.provider);
    this.hub = new ethers.Contract(this.addresses.hub, HubABI, this.provider);
    this.verifier = new ethers.Contract(this.addresses.verifier, VerifierABI, this.provider);
    this.zkWrapper = new ethers.Contract(this.addresses.zkVerifier, ZKWrapperABI, this.provider);
    this.decay = new ethers.Contract(this.addresses.decay, DecayABI, this.provider);
    this.aggregator = new ethers.Contract(this.addresses.aggregator, AggregatorABI, this.provider);
  }

  // ━━━ CREDENTIAL QUERIES ━━━

  /** Get a user's skill credential from the on-chain registry */
  async getCredential(address: string): Promise<SkillCredential | null> {
    try {
      const cred = await this.registry.getCredential(address);
      if (!cred.isValid) return null;
      return {
        issuer: cred.issuer,
        playerName: cred.playerName,
        overallElo: Number(cred.overallElo),
        percentile: Number(cred.percentile),
        totalMatches: Number(cred.totalMatches),
        winRate: Number(cred.winRate),
        domains: [...cred.skillDomains],
        skillScores: cred.skillScores.map(Number),
        skillPercentiles: cred.skillPercentiles.map(Number),
        timestamp: Number(cred.issuedAt),
        isValid: cred.isValid,
      };
    } catch {
      return null;
    }
  }

  /** Check if a user has a credential */
  async hasCredential(address: string): Promise<boolean> {
    try {
      return await this.registry.hasCredential(address);
    } catch {
      return false;
    }
  }

  /** Get effective ELO (base + reputation bonus from Hub activity) */
  async getEffectiveElo(address: string): Promise<number> {
    return Number(await this.hub.getEffectiveElo(address));
  }

  /** Get decayed ELO (base ELO * time decay multiplier) */
  async getDecayedElo(address: string): Promise<number> {
    return Number(await this.decay.getDecayedElo(address));
  }

  /** Get reputation bonus (can be negative) */
  async getReputationBonus(address: string): Promise<number> {
    return Number(await this.hub.reputationBonus(address));
  }

  /** Get decay multiplier in basis points (10000 = 100%) */
  async getDecayMultiplier(address: string): Promise<number> {
    return Number(await this.decay.getDecayMultiplier(address));
  }

  /** Get effective voting power (ELO-weighted governance) */
  async getEffectiveVotingPower(address: string): Promise<number> {
    return Number(await this.hub.getEffectiveVotingPower(address));
  }

  // ━━━ SKILL GATING (THE KEY SDK FEATURE) ━━━

  /**
   * Check if a user passes a skill gate.
   * This is the main integration point for other protocols.
   *
   * @example
   * ```ts
   * const sdk = new SkillProof("https://coston2-api.flare.network/ext/C/rpc");
   * const result = await sdk.checkGate(userAddress, { minElo: 1500 });
   * if (result.passed) { // grant access }
   * ```
   */
  async checkGate(address: string, config: SkillGateConfig): Promise<GateResult> {
    const cred = await this.getCredential(address);
    if (!cred) {
      return { passed: false, reason: "No credential found", elo: 0, percentile: 0, domains: [] };
    }

    // Determine which ELO to use
    let elo = cred.overallElo;
    if (config.useEffectiveElo) {
      elo = await this.getEffectiveElo(address);
    } else if (config.useDecayedElo) {
      elo = await this.getDecayedElo(address);
    }

    // Check ELO threshold
    if (config.minElo && elo < config.minElo) {
      return {
        passed: false,
        reason: `ELO ${elo} below minimum ${config.minElo}`,
        elo,
        percentile: cred.percentile,
        domains: cred.domains,
      };
    }

    // Check percentile threshold
    if (config.minPercentile && cred.percentile < config.minPercentile) {
      return {
        passed: false,
        reason: `Percentile ${cred.percentile} below minimum ${config.minPercentile}`,
        elo,
        percentile: cred.percentile,
        domains: cred.domains,
      };
    }

    // Check required domains
    if (config.requiredDomains && config.requiredDomains.length > 0) {
      const missing = config.requiredDomains.filter((d) => !cred.domains.includes(d));
      if (missing.length > 0) {
        return {
          passed: false,
          reason: `Missing domains: ${missing.join(", ")}`,
          elo,
          percentile: cred.percentile,
          domains: cred.domains,
        };
      }
    }

    return { passed: true, elo, percentile: cred.percentile, domains: cred.domains };
  }

  // ━━━ AGGREGATE QUERIES ━━━

  /** Get aggregate score across all linked issuers */
  async getAggregateScore(address: string): Promise<AggregateScore> {
    try {
      const score = await this.aggregator.getAggregateScore(address);
      return {
        compositeElo: Number(score.compositeElo),
        compositePercentile: Number(score.compositePercentile),
        totalMatches: Number(score.totalMatches),
        issuerCount: Number(score.issuerCount),
        domainCount: Number(score.domainCount),
        crossDomainBonus: Number(score.crossDomainBonus),
        overallScore: Number(score.overallScore),
      };
    } catch {
      return {
        compositeElo: 0,
        compositePercentile: 0,
        totalMatches: 0,
        issuerCount: 0,
        domainCount: 0,
        crossDomainBonus: 0,
        overallScore: 0,
      };
    }
  }

  /** Get linked addresses for a primary identity */
  async getLinkedAddresses(primary: string): Promise<string[]> {
    try {
      return await this.aggregator.getLinkedAddresses(primary);
    } catch {
      return [];
    }
  }

  // ━━━ ZK VERIFICATION QUERIES ━━━

  /** Check if a user has a verified ZK threshold proof */
  async isZKVerified(address: string): Promise<boolean> {
    try {
      return await this.zkWrapper.isZKVerified(address);
    } catch {
      return false;
    }
  }

  /** Get the ZK-verified threshold for a user */
  async getVerifiedThreshold(address: string): Promise<number> {
    return Number(await this.zkWrapper.getVerifiedThreshold(address));
  }

  // ━━━ LEADERBOARD ━━━

  /** Get leaderboard addresses (paginated) */
  async getLeaderboard(start: number = 0, count: number = 10): Promise<string[]> {
    try {
      return await this.hub.getLeaderboard(start, count);
    } catch {
      return [];
    }
  }

  // ━━━ PROTOCOL STATS ━━━

  /** Get protocol-wide statistics */
  async getProtocolStats(): Promise<ProtocolStats> {
    const [merkleCount, zkCount, marketCount, bountyCount, proposalCount, participantCount] =
      await Promise.all([
        this.verifier.getVerificationCount().catch(() => 0n),
        this.zkWrapper.getZKVerificationCount().catch(() => 0n),
        this.hub.marketCount().catch(() => 0n),
        this.hub.bountyCount().catch(() => 0n),
        this.hub.proposalCount().catch(() => 0n),
        this.hub.participantCount().catch(() => 0n),
      ]);
    return {
      merkleVerifications: Number(merkleCount),
      zkVerifications: Number(zkCount),
      totalMarkets: Number(marketCount),
      totalBounties: Number(bountyCount),
      totalProposals: Number(proposalCount),
      totalParticipants: Number(participantCount),
    };
  }
}

// Named exports for convenience
export { COSTON2_ADDRESSES };
export default SkillProof;

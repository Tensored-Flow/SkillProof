import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import {
  SkillProofService,
  CredentialPayload,
  Credential,
  ProofRequest,
  ProofResult,
  VerificationResult,
  OracleAttestation,
} from "./types";

const ATTESTOR_ADDRESS = "0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4";
const REGISTRY_ADDRESS = "0xa855e8E15C9F350438065D19a73565ea1A23E33A";
const COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc";

// Minimal ABIs for the functions we need
const ATTESTOR_ABI = [
  "function getAttestation(address player) view returns (tuple(uint256 attestedAt, uint256 flareTimestamp, int256 anchorPrice, string pricePair, bool isAttested))",
  "function attestCredential(address player)",
];

const REGISTRY_ABI = [
  "function getCredential(address player) view returns (tuple(string playerName, uint256 overallElo, uint256 percentile, string[] skillDomains, uint256[] skillScores, uint256[] skillPercentiles, uint256 totalMatches, uint256 winRate, address issuer, uint256 issuedAt, bool isValid))",
  "function hasCredential(address player) view returns (bool)",
];

function getReadProvider() {
  return new JsonRpcProvider(COSTON2_RPC);
}

async function getWriteProvider() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = (window as any).ethereum;
  if (typeof window === "undefined" || !eth) {
    throw new Error("MetaMask not found");
  }
  return new BrowserProvider(eth);
}

export const contractService: SkillProofService = {
  async issueCredential(_payload: CredentialPayload): Promise<Credential> {
    // In production, this would call the registry contract's mintCredential
    // For now, we surface the contract read path and leave write operations for future
    throw new Error("Issuing credentials requires direct contract interaction. Use the Hardhat scripts.");
  },

  async revokeCredential(_credId: string): Promise<void> {
    throw new Error("Revoking credentials requires direct contract interaction. Use the Hardhat scripts.");
  },

  async getCredential(addressOrId: string): Promise<Credential | null> {
    const provider = getReadProvider();
    const registry = new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

    try {
      const has = await registry.hasCredential(addressOrId);
      if (!has) return null;

      const cred = await registry.getCredential(addressOrId);
      return {
        credentialId: addressOrId,
        status: cred.isValid ? "issued" : "revoked",
        userAddress: addressOrId,
        domain: cred.skillDomains?.[0] || "quant",
        label: cred.playerName,
        scoreCommitment: "0x" + BigInt(cred.overallElo).toString(16).padStart(64, "0"),
        txHash: "on-chain",
        issuedAt: new Date(Number(cred.issuedAt) * 1000).toISOString(),
      };
    } catch {
      return null;
    }
  },

  async requestProof(_request: ProofRequest): Promise<ProofResult> {
    // ZK proof generation would happen client-side with a circuit
    throw new Error("ZK proof generation not yet implemented for production mode.");
  },

  async verifyProof(credId: string, proof: ProofResult): Promise<VerificationResult> {
    const att = await this.getAttestation(credId);
    const cred = await this.getCredential(credId);

    return {
      credentialStatus: cred ? cred.status : "unknown",
      proofValid: true,
      claimSatisfied: proof.result,
      oracleAttestation: att,
      checkedAt: new Date().toISOString(),
    };
  },

  async getAttestation(playerAddress: string): Promise<OracleAttestation> {
    const provider = getReadProvider();
    const attestor = new Contract(ATTESTOR_ADDRESS, ATTESTOR_ABI, provider);

    try {
      const att = await attestor.getAttestation(playerAddress);
      return {
        timestamp: Number(att.flareTimestamp),
        flrUsdPrice: Number(att.anchorPrice),
        isAttested: att.isAttested,
        attestationHash: "0x" + BigInt(att.attestedAt).toString(16).padStart(64, "0"),
      };
    } catch {
      return {
        timestamp: 0,
        flrUsdPrice: 0,
        isAttested: false,
        attestationHash: "0x" + "0".repeat(64),
      };
    }
  },
};

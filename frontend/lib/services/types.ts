export interface CredentialPayload {
  userAddress: string;
  domain: "quant" | "ib" | "consulting" | "custom";
  label: string;
  score: number;
  percentile: number;
  metadata?: {
    arenaId?: string;
    timestamp?: string;
    elo?: number;
  };
}

export interface Credential {
  credentialId: string;
  status: "issued" | "revoked";
  userAddress: string;
  domain: string;
  label: string;
  scoreCommitment: string;
  txHash: string;
  issuedAt: string;
  attestationId?: string;
}

export interface ProofRequest {
  credentialId: string;
  claimType: "score_gte" | "percentile_gte";
  threshold: number;
}

export interface ProofResult {
  proofId: string;
  credentialId: string;
  claimType: string;
  threshold: number;
  result: boolean;
  proof: {
    scheme: "groth16";
    publicSignals: string[];
    proof: unknown;
  };
  generatedAt: string;
}

export interface OracleAttestation {
  timestamp: number;
  flrUsdPrice: number;
  isAttested: boolean;
  attestationHash: string;
}

export interface VerificationResult {
  credentialStatus: "issued" | "revoked" | "unknown";
  proofValid: boolean;
  claimSatisfied: boolean;
  oracleAttestation: OracleAttestation;
  checkedAt: string;
}

export interface SkillProofService {
  issueCredential(payload: CredentialPayload): Promise<Credential>;
  revokeCredential(credId: string, reason?: string): Promise<void>;
  getCredential(credId: string): Promise<Credential | null>;
  requestProof(request: ProofRequest): Promise<ProofResult>;
  verifyProof(credId: string, proof: ProofResult): Promise<VerificationResult>;
  getAttestation(playerAddress: string): Promise<OracleAttestation>;
}

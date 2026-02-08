import {
  SkillProofService,
  CredentialPayload,
  Credential,
  ProofRequest,
  ProofResult,
  VerificationResult,
  OracleAttestation,
} from "./types";

const STORAGE_KEY = "skillproof_credentials";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomHex = (len: number) =>
  "0x" +
  Array.from({ length: len }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");

function hashCommitment(score: number, salt: string): string {
  // Simulated hash — in production this would be a real hash
  const raw = `${score}:${salt}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return "0x" + Math.abs(h).toString(16).padStart(64, "0");
}

function loadCredentials(): Record<string, Credential & { score: number; percentile: number }> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCredentials(creds: Record<string, Credential & { score: number; percentile: number }>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

// Pre-seeded oracle data for known test addresses
const KNOWN_ATTESTATIONS: Record<string, OracleAttestation> = {
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8": {
    timestamp: 1738974255,
    flrUsdPrice: 95397,
    isAttested: true,
    attestationHash: "0x4d492568e75696d43bd1ae9d93304a2412b7bbb7228fba128433036b61557458",
  },
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC": {
    timestamp: 1738974256,
    flrUsdPrice: 95385,
    isAttested: true,
    attestationHash: "0xc778694163cad8f73075e3aabbcc5c70bad577e7a7cc7d1f8ed751373ca693da",
  },
};

// Pre-seeded credentials for demo
const DEMO_CREDENTIALS: Record<string, Credential & { score: number; percentile: number }> = {
  "demo-leon": {
    credentialId: "demo-leon",
    status: "issued",
    userAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    domain: "quant",
    label: "FinCraft Quant Arena - Feb 2026",
    scoreCommitment: "0x00000000000000000000000000000000000000000000000000000000a1b2c3d4",
    txHash: "0x145997852c376aeba956827a6f9271bb91eea9d213b888adb06bc77814bf1964",
    issuedAt: "2026-02-08T00:24:00.000Z",
    attestationId: "0x4d492568e756",
    score: 96,
    percentile: 95,
  },
  "demo-alex": {
    credentialId: "demo-alex",
    status: "issued",
    userAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    domain: "quant",
    label: "FinCraft Quant Arena - Feb 2026",
    scoreCommitment: "0x00000000000000000000000000000000000000000000000000000000e5f6a7b8",
    txHash: "0xac84ac0c52d2ed157f035c3143c541b8a31366f40d2b789355ce771f4d4212b9",
    issuedAt: "2026-02-08T00:24:00.000Z",
    attestationId: "0xc778694163ca",
    score: 74,
    percentile: 62,
  },
};

export const mockService: SkillProofService = {
  async issueCredential(payload: CredentialPayload): Promise<Credential> {
    await delay(1500);
    const creds = loadCredentials();
    const salt = randomHex(16);
    const credentialId = "cred-" + Date.now().toString(36);
    const cred = {
      credentialId,
      status: "issued" as const,
      userAddress: payload.userAddress,
      domain: payload.domain,
      label: payload.label,
      scoreCommitment: hashCommitment(payload.score, salt),
      txHash: randomHex(32),
      issuedAt: new Date().toISOString(),
      score: payload.score,
      percentile: payload.percentile,
    };
    creds[credentialId] = cred;
    // Also index by address for lookup
    creds["addr:" + payload.userAddress.toLowerCase()] = cred;
    saveCredentials(creds);
    return cred;
  },

  async revokeCredential(credId: string): Promise<void> {
    await delay(1000);
    const creds = loadCredentials();
    if (creds[credId]) {
      creds[credId].status = "revoked";
      saveCredentials(creds);
    }
  },

  async getCredential(credId: string): Promise<(Credential & { score?: number; percentile?: number }) | null> {
    await delay(800);
    // Check demo credentials first
    if (DEMO_CREDENTIALS[credId]) return { ...DEMO_CREDENTIALS[credId] };
    const creds = loadCredentials();
    // Search by credentialId
    if (creds[credId]) return creds[credId];
    // Search by address
    const byAddr = creds["addr:" + credId.toLowerCase()];
    if (byAddr) return byAddr;
    // Search demo by address
    for (const dc of Object.values(DEMO_CREDENTIALS)) {
      if (dc.userAddress.toLowerCase() === credId.toLowerCase()) return { ...dc };
    }
    return null;
  },

  async requestProof(request: ProofRequest): Promise<ProofResult> {
    await delay(2000);
    // Find the credential to check the actual score
    const allCreds = { ...DEMO_CREDENTIALS, ...loadCredentials() };
    const cred = allCreds[request.credentialId];
    let result = false;
    if (cred) {
      const val = request.claimType === "score_gte" ? cred.score : cred.percentile;
      result = val >= request.threshold;
    }

    return {
      proofId: "proof-" + Date.now().toString(36),
      credentialId: request.credentialId,
      claimType: request.claimType,
      threshold: request.threshold,
      result,
      proof: {
        scheme: "groth16",
        publicSignals: [
          request.claimType === "score_gte" ? "1" : "2",
          request.threshold.toString(),
          result ? "1" : "0",
          cred?.scoreCommitment || "0x0",
        ],
        proof: {
          pi_a: [randomHex(32), randomHex(32)],
          pi_b: [[randomHex(32), randomHex(32)], [randomHex(32), randomHex(32)]],
          pi_c: [randomHex(32), randomHex(32)],
          protocol: "groth16",
          curve: "bn128",
        },
      },
      generatedAt: new Date().toISOString(),
    };
  },

  async verifyProof(credId: string, proof: ProofResult): Promise<VerificationResult> {
    await delay(1500);
    const allCreds = { ...DEMO_CREDENTIALS, ...loadCredentials() };
    const cred = allCreds[credId];
    const addr = cred?.userAddress || "";
    const att = KNOWN_ATTESTATIONS[addr] || {
      timestamp: Math.floor(Date.now() / 1000),
      flrUsdPrice: 95390,
      isAttested: !!cred,
      attestationHash: randomHex(32),
    };

    return {
      credentialStatus: cred ? cred.status : "unknown",
      proofValid: true,
      claimSatisfied: proof.result,
      oracleAttestation: att,
      checkedAt: new Date().toISOString(),
    };
  },

  async getAttestation(playerAddress: string): Promise<OracleAttestation> {
    await delay(800);
    return (
      KNOWN_ATTESTATIONS[playerAddress] || {
        timestamp: 0,
        flrUsdPrice: 0,
        isAttested: false,
        attestationHash: "0x" + "0".repeat(64),
      }
    );
  },
};

import { SkillProofService } from "./types";
import { mockService } from "./mock";
import { contractService } from "./contract";

export function getService(demoMode: boolean): SkillProofService {
  return demoMode ? mockService : contractService;
}

export type { SkillProofService } from "./types";
export type {
  Credential,
  CredentialPayload,
  ProofRequest,
  ProofResult,
  VerificationResult,
  OracleAttestation,
} from "./types";

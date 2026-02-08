import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useApp } from "@/pages/_app";
import { getService, ProofResult, VerificationResult } from "@/lib/services";
import { getHubService } from "@/lib/services/hub-index";
import { JsonRpcProvider, Contract } from "ethers";

const VERIFIER_ADDRESS = "0xBEFded5454c7b3E16f1Db888e8280793735B866b";
const GROTH16_ADDRESS = "0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664";
const ZK_VERIFIER_ADDRESS = "0x0F46334167e68C489DE6B65D488F9d64624Bc270";
const COSTON2_RPC = "https://coston2-api.flare.network/ext/C/rpc";

const VERIFIER_ABI = [
  "function credentialMerkleRoot() view returns (bytes32)",
  "function verificationCount() view returns (uint256)",
  "function verifiedAboveThreshold(address) view returns (bool)",
  "function getMerkleRoot() view returns (bytes32)",
  "function getVerificationCount() view returns (uint256)",
  "function isVerifiedAboveThreshold(address) view returns (bool)",
];

function formatFlrPrice(raw: number): string {
  if (raw > 1_000_000) return "$" + (raw / 100_000_000).toFixed(5);
  return "$" + (raw / 100_000).toFixed(5);
}

function formatTimestamp(ts: number): string {
  if (!ts) return "N/A";
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function addrShort(a: string): string {
  return a.slice(0, 10) + "..." + a.slice(-6);
}

function randomHex(bytes: number): string {
  return "0x" + Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
}

const DEMO_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export default function VerifyPage() {
  const { demoMode, wallet, setResponseData, showToast } = useApp();
  const service = getService(demoMode);
  const hub = getHubService(demoMode);
  const router = useRouter();

  const [credentialId, setCredentialId] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // ── Merkle Verification State ──
  const [merkleRoot, setMerkleRoot] = useState<string | null>(null);
  const [verificationCount, setVerificationCount] = useState<number | null>(null);
  const [thresholdInput, setThresholdInput] = useState("1500");
  const [thresholdStatus, setThresholdStatus] = useState<boolean | null>(null);
  const [merkleLoading, setMerkleLoading] = useState(false);

  // ── ZK Verification State ──
  const [zkVerificationCount, setZkVerificationCount] = useState<number | null>(null);
  const [zkThresholdInput, setZkThresholdInput] = useState("1500");
  const [zkVerified, setZkVerified] = useState<boolean | null>(null);
  const [zkThreshold, setZkThreshold] = useState<number | null>(null);
  const [zkLoading, setZkLoading] = useState(false);
  const [zkProving, setZkProving] = useState(false);
  const [merkleProving, setMerkleProving] = useState(false);
  const [merkleResult, setMerkleResult] = useState<{ verified: boolean; elo: number; threshold: number } | null>(null);
  const [zkStep, setZkStep] = useState<string | null>(null);
  const [zkResult, setZkResult] = useState<{ verified: boolean; elo: number; threshold: number; proof: object } | null>(null);

  useEffect(() => {
    loadMerkleData();
    loadZKData();
  }, [demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMerkleData() {
    setMerkleLoading(true);
    try {
      if (demoMode) {
        setMerkleRoot("0xfa207bee...ed02f7cfa0b990");
        setVerificationCount(0);
        setThresholdStatus(null);
      } else {
        const provider = new JsonRpcProvider(COSTON2_RPC);
        const verifier = new Contract(VERIFIER_ADDRESS, VERIFIER_ABI, provider);
        const [root, count] = await Promise.all([
          verifier.getMerkleRoot(),
          verifier.getVerificationCount(),
        ]);
        setMerkleRoot(root);
        setVerificationCount(Number(count));
        // Check threshold status for connected wallet
        if (wallet) {
          const isAbove = await verifier.isVerifiedAboveThreshold(wallet);
          setThresholdStatus(isAbove);
        }
      }
    } catch {
      // Verifier data unavailable
    } finally {
      setMerkleLoading(false);
    }
  }

  async function loadZKData() {
    setZkLoading(true);
    try {
      const count = await hub.getZKVerificationCount();
      setZkVerificationCount(count);
      if (wallet) {
        const [verified, threshold] = await Promise.all([
          hub.isZKVerified(wallet),
          hub.getZKVerifiedThreshold(wallet),
        ]);
        setZkVerified(verified);
        setZkThreshold(threshold);
      }
    } catch {
      // ZK data unavailable
    } finally {
      setZkLoading(false);
    }
  }

  async function handleMerkleProve() {
    if (!demoMode) {
      showToast({ type: "warning", message: "Live mode: Merkle threshold proofs require the operator to provide proof paths. Use CLI: npx hardhat run scripts/deploy-verifier.ts" });
      return;
    }
    setMerkleProving(true);
    setMerkleResult(null);
    try {
      const addr = wallet || DEMO_ADDRESS;
      await new Promise((r) => setTimeout(r, 600));
      const cred = await service.getCredential(addr);
      const elo = cred?.scoreCommitment ? parseInt(cred.scoreCommitment, 16) || 1847 : 1847;
      const threshold = parseInt(thresholdInput) || 1500;
      await new Promise((r) => setTimeout(r, 900));
      const verified = elo >= threshold;
      const proofData = {
        method: "merkle_threshold",
        user: addr,
        elo,
        threshold,
        verified,
        leaf: randomHex(32),
        proof: [randomHex(32), randomHex(32), randomHex(32)],
        root: merkleRoot,
        timestamp: new Date().toISOString(),
      };
      setMerkleResult({ verified, elo, threshold });
      setResponseData(proofData);
      if (verified) {
        setThresholdStatus(true);
        setVerificationCount((c) => (c ?? 0) + 1);
        showToast({ type: "success", message: `Merkle verified: ELO ${elo} >= ${threshold}` });
      } else {
        setThresholdStatus(false);
        showToast({ type: "error", message: `ELO ${elo} below threshold ${threshold}` });
      }
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setMerkleProving(false);
    }
  }

  async function handleZKProve() {
    if (!demoMode) {
      showToast({ type: "warning", message: "Live mode: ZK proof generation requires circuit artifacts (WASM + zkey). Use CLI: npx hardhat run scripts/generate-zk-proof.ts" });
      return;
    }
    setZkProving(true);
    setZkResult(null);
    try {
      const addr = wallet || DEMO_ADDRESS;

      setZkStep("Loading credential...");
      await new Promise((r) => setTimeout(r, 500));
      const cred = await service.getCredential(addr);
      const elo = cred?.scoreCommitment ? parseInt(cred.scoreCommitment, 16) || 1847 : 1847;
      const threshold = parseInt(zkThresholdInput) || 1500;

      setZkStep("Computing witness...");
      await new Promise((r) => setTimeout(r, 800));
      const salt = BigInt(randomHex(8));
      const commitment = BigInt(elo) + salt * BigInt(2 ** 32);

      setZkStep("Generating Groth16 proof...");
      await new Promise((r) => setTimeout(r, 1200));
      const proof = {
        pi_a: [randomHex(32), randomHex(32), "1"],
        pi_b: [[randomHex(32), randomHex(32)], [randomHex(32), randomHex(32)], ["1", "0"]],
        pi_c: [randomHex(32), randomHex(32), "1"],
        protocol: "groth16",
        curve: "bn128",
      };
      const publicSignals = ["1", String(threshold), String(commitment)];

      setZkStep("Verifying on-chain...");
      await new Promise((r) => setTimeout(r, 500));
      const verified = elo >= threshold;

      const fullResult = {
        method: "zk_threshold",
        user: addr,
        threshold,
        verified,
        proof,
        publicSignals,
        commitment: String(commitment),
        circuit: "threshold_proof.circom",
        constraints: 36,
        timestamp: new Date().toISOString(),
      };

      setZkResult({ verified, elo, threshold, proof: fullResult });
      setResponseData(fullResult);
      if (verified) {
        setZkVerified(true);
        setZkThreshold(threshold);
        setZkVerificationCount((c) => (c ?? 0) + 1);
        showToast({ type: "success", message: `ZK Verified: ELO ${elo} >= ${threshold}` });
      } else {
        setZkVerified(false);
        showToast({ type: "error", message: `ZK proof failed: ELO ${elo} below threshold ${threshold}` });
      }
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setZkProving(false);
      setZkStep(null);
    }
  }

  // Load pre-filled data from query params (from user dashboard "Send to Verifier")
  useEffect(() => {
    if (router.query.data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(router.query.data as string));
        setCredentialId(parsed.credentialId || "");
        setProofJson(JSON.stringify(parsed.proof, null, 2));
        showToast({ type: "success", message: "Proof data loaded from user" });
      } catch {
        // ignore parse errors
      }
    }
  }, [router.query.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadDemo() {
    setCredentialId("demo-leon");
    setProofJson(
      JSON.stringify(
        {
          proofId: "proof-demo",
          credentialId: "demo-leon",
          claimType: "percentile_gte",
          threshold: 90,
          result: true,
          proof: {
            scheme: "groth16",
            publicSignals: ["2", "90", "1", "0x00000000000000000000000000000000000000000000000000000000a1b2c3d4"],
            proof: { pi_a: ["0x1a2b...", "0x3c4d..."], protocol: "groth16", curve: "bn128" },
          },
          generatedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
    showToast({ type: "success", message: "Demo proof loaded" });
  }

  async function handleVerify() {
    if (!credentialId || !proofJson) {
      showToast({ type: "error", message: "Provide credential ID and proof" });
      return;
    }
    setVerifying(true);
    try {
      const proof: ProofResult = JSON.parse(proofJson);
      const res = await service.verifyProof(credentialId, proof);
      setResult(res);
      setResponseData(res);
      showToast({ type: "success", message: "Verification complete" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 lg:px-12 animate-fade-in">
      {/* Page Header */}
      <div className="pt-8 pb-10">
        <h1 className="text-3xl font-bold mb-1 tracking-wide">VERIFY</h1>
        <p className="text-xs text-[#555] font-body">
          Commit-reveal, Merkle, ZK-SNARK — multi-layer crypto verification stack
          {demoMode && <span className="badge-pink ml-2">Demo</span>}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          THREE VERIFICATION TESTS — PARALLEL LAYOUT
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ──────────────────────────────────────────────────────────────────
            COLUMN 1: ORACLE VERIFY
            ────────────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-l-2 border-accent pl-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-accent">Oracle Verify</h2>
          </div>

          <div className="card space-y-4 h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#555] uppercase tracking-wide">Flare FTSO Attestation</span>
              <button onClick={loadDemo} className="btn-ghost text-[10px]">Load Demo</button>
            </div>

            <div>
              <label className="label">Credential ID</label>
              <input
                className="input-field text-xs"
                placeholder="cred-... or demo-leon"
                value={credentialId}
                onChange={(e) => setCredentialId(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Proof JSON</label>
              <textarea
                className="input-field min-h-[100px] font-mono text-[10px]"
                placeholder='{"proofId": "...", "proof": {...}}'
                value={proofJson}
                onChange={(e) => setProofJson(e.target.value)}
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={verifying}
              className="btn-primary w-full"
            >
              {verifying ? "Verifying..." : "Verify"}
            </button>

            {/* Inline Result */}
            {result && (
              <div className="border-t border-[#1a1a1a] pt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Status</div>
                    <div className={`text-sm font-bold uppercase ${result.credentialStatus === "issued" ? "text-accent" : "text-pink"}`}>
                      {result.credentialStatus}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Proof</div>
                    <div className={`text-sm font-bold uppercase ${result.proofValid ? "text-accent" : "text-pink"}`}>
                      {result.proofValid ? "Valid" : "Invalid"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Claim</div>
                    <div className={`text-sm font-bold uppercase ${result.claimSatisfied ? "text-accent" : "text-pink"}`}>
                      {result.claimSatisfied ? "True" : "False"}
                    </div>
                  </div>
                </div>
                {result.oracleAttestation.isAttested && (
                  <div className="bg-[#0d0d0d] border border-accent/30 p-3 text-[10px]">
                    <div className="text-accent font-bold mb-1">⚡ Oracle Attested</div>
                    <div className="text-[#666]">{formatTimestamp(result.oracleAttestation.timestamp)}</div>
                    <div className="text-[#666]">FLR/USD: {formatFlrPrice(result.oracleAttestation.flrUsdPrice)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            COLUMN 2: MERKLE PROOF
            ────────────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-l-2 border-amber-500 pl-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-amber-500">Merkle Proof</h2>
          </div>

          <div className="card space-y-4 h-full">
            <div className="text-[10px] text-[#555] uppercase tracking-wide">Hash-Based Privacy</div>

            {/* Merkle Root Display */}
            <div>
              <label className="label">Merkle Root</label>
              {merkleLoading ? (
                <div className="h-8 bg-[#1a1a1a] animate-pulse" />
              ) : (
                <div className="bg-[#0a0a0a] border border-amber-500/30 p-2 text-[10px] font-mono text-amber-500 break-all">
                  {merkleRoot || "Not set"}
                </div>
              )}
            </div>

            {/* Verification Count */}
            <div className="text-center py-4 bg-[#0d0d0d] border border-[#1a1a1a]">
              {merkleLoading ? (
                <div className="h-10 bg-[#1a1a1a] w-16 mx-auto animate-pulse" />
              ) : (
                <div className="stat-number-amber text-3xl">{verificationCount ?? 0}</div>
              )}
              <div className="text-[9px] text-[#555] uppercase mt-1">Verifications</div>
            </div>

            {/* Threshold Input */}
            <div>
              <label className="label">ELO Threshold</label>
              <input
                className="input-field text-xs"
                type="number"
                min="0"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
              />
            </div>

            <button
              onClick={handleMerkleProve}
              disabled={merkleProving}
              className="btn-primary w-full"
              style={{ borderColor: "#F59E0B", color: "#F59E0B" }}
            >
              {merkleProving ? "Proving..." : "Prove Threshold"}
            </button>

            {/* Inline Result */}
            {merkleResult && (
              <div className="border-t border-[#1a1a1a] pt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">ELO</div>
                    <div className="text-sm font-bold text-amber-500">{merkleResult.elo}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Threshold</div>
                    <div className="text-sm font-bold text-[#888]">{merkleResult.threshold}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Result</div>
                    <div className={`text-sm font-bold uppercase ${merkleResult.verified ? "text-accent" : "text-pink"}`}>
                      {merkleResult.verified ? "Pass" : "Fail"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Status */}
            <div className={`border-t border-[#1a1a1a] pt-4 text-[10px] ${merkleResult ? "" : ""}`}>
              <span className="text-[#555]">Status: </span>
              {thresholdStatus === true ? (
                <span className="text-accent font-bold">Verified above threshold</span>
              ) : thresholdStatus === false ? (
                <span className="text-pink font-bold">Below threshold</span>
              ) : (
                <span className="text-[#555]">{demoMode ? "Click Prove to verify" : "Connect wallet to check"}</span>
              )}
            </div>

            <div className="text-[9px] text-[#444]">
              Contract:{" "}
              <a
                href={`https://coston2-explorer.flare.network/address/${VERIFIER_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 hover:underline"
              >
                {addrShort(VERIFIER_ADDRESS)}
              </a>
            </div>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            COLUMN 3: ZK-SNARK
            ────────────────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-l-2 border-pink pl-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-pink">ZK-SNARK</h2>
          </div>

          <div className="card space-y-4 h-full">
            <div className="flex items-center gap-2 text-[10px] text-[#555]">
              <span className="border border-[#2a2a2a] px-2 py-0.5">Groth16</span>
              <span className="border border-[#2a2a2a] px-2 py-0.5">36 constraints</span>
            </div>

            {/* ZK Verification Count */}
            <div className="text-center py-4 bg-[#0d0d0d] border border-[#1a1a1a]">
              {zkLoading ? (
                <div className="h-10 bg-[#1a1a1a] w-16 mx-auto animate-pulse" />
              ) : (
                <div className="stat-number-pink text-3xl">{zkVerificationCount ?? 0}</div>
              )}
              <div className="text-[9px] text-[#555] uppercase mt-1">ZK Proofs Verified</div>
            </div>

            {/* How it works - compact */}
            <div className="text-[10px] text-[#555] leading-relaxed bg-[#0d0d0d] border border-[#1a1a1a] p-3">
              Proves "my ELO ≥ threshold" without revealing exact score. Commitment scheme + Groth16 verification on-chain.
            </div>

            {/* Threshold Input */}
            <div>
              <label className="label">Threshold</label>
              <input
                className="input-field text-xs"
                type="number"
                min="0"
                value={zkThresholdInput}
                onChange={(e) => setZkThresholdInput(e.target.value)}
              />
            </div>

            <button
              onClick={handleZKProve}
              disabled={zkProving}
              className="btn-pink w-full"
            >
              {zkStep || (zkProving ? "Generating..." : "Generate & Verify ZK Proof")}
            </button>

            {/* Inline Result */}
            {zkResult && (
              <div className="border-t border-[#1a1a1a] pt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">ELO</div>
                    <div className="text-sm font-bold text-pink">{zkResult.elo}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Threshold</div>
                    <div className="text-sm font-bold text-[#888]">{zkResult.threshold}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[#555] uppercase">Result</div>
                    <div className={`text-sm font-bold uppercase ${zkResult.verified ? "text-accent" : "text-pink"}`}>
                      {zkResult.verified ? "Pass" : "Fail"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="border-t border-[#1a1a1a] pt-4 text-[10px]">
              <span className="text-[#555]">Status: </span>
              {zkVerified === true ? (
                <span className="text-accent font-bold">ZK Verified {">="} {zkThreshold}</span>
              ) : zkVerified === false ? (
                <span className="text-pink font-bold">Proof failed</span>
              ) : (
                <span className="text-[#555]">{demoMode ? "Click to generate proof" : "Submit a proof to verify"}</span>
              )}
            </div>

            {/* Contracts */}
            <div className="text-[9px] text-[#444] space-y-1">
              <div>
                Groth16:{" "}
                <a
                  href={`https://coston2-explorer.flare.network/address/${GROTH16_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink hover:underline"
                >
                  {addrShort(GROTH16_ADDRESS)}
                </a>
              </div>
              <div>
                ZKVerifier:{" "}
                <a
                  href={`https://coston2-explorer.flare.network/address/${ZK_VERIFIER_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-pink hover:underline"
                >
                  {addrShort(ZK_VERIFIER_ADDRESS)}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

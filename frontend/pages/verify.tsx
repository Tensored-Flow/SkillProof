import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useApp } from "@/pages/_app";
import { getService, ProofResult, VerificationResult } from "@/lib/services";

function formatFlrPrice(raw: number): string {
  // The price stored is in raw units — for our test data it's like 95397
  // which represents $0.95397
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

export default function VerifyPage() {
  const { demoMode, setResponseData, showToast } = useApp();
  const service = getService(demoMode);
  const router = useRouter();

  const [credentialId, setCredentialId] = useState("");
  const [proofJson, setProofJson] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

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
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Verifier</h1>
        <p className="text-xs text-muted">
          Verify credential proofs with on-chain oracle attestation
          {demoMode && <span className="badge-pink ml-2">Demo</span>}
        </p>
      </div>

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
            Verify Proof
          </h2>
          <button onClick={loadDemo} className="btn-secondary btn-small">
            Load Demo Proof
          </button>
        </div>

        <div>
          <label className="label">Credential ID</label>
          <input
            className="input-field"
            placeholder="cred-... or demo-leon"
            value={credentialId}
            onChange={(e) => setCredentialId(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Proof JSON</label>
          <textarea
            className="input-field min-h-[160px] font-mono text-xs"
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
      </section>

      {/* Verification Results */}
      {result && (
        <div className="space-y-4">
          {/* Oracle Attestation Badge */}
          {result.oracleAttestation.isAttested && (
            <div className="border-2 border-accent p-6 animate-pulse_glow">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-accent text-xl">{"\u26A1"}</span>
                <span className="text-sm font-bold uppercase tracking-widest text-accent">
                  Oracle Attested on Flare
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted block">Timestamp</span>
                  <span className="text-white">
                    {formatTimestamp(result.oracleAttestation.timestamp)}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">FLR/USD Price</span>
                  <span className="text-white">
                    {formatFlrPrice(result.oracleAttestation.flrUsdPrice)}
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Attestation Hash</span>
                  <span className="text-accent break-all">
                    {result.oracleAttestation.attestationHash.slice(0, 18)}...
                  </span>
                </div>
                <div>
                  <span className="text-muted block">Data Source</span>
                  <span className="text-accent">
                    {demoMode ? "Mock Data" : "Live Contract"} {"\u2713"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Result cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card text-center">
              <label className="label">Credential Status</label>
              <div
                className={`text-lg font-bold uppercase ${
                  result.credentialStatus === "issued"
                    ? "text-accent"
                    : result.credentialStatus === "revoked"
                    ? "text-pink"
                    : "text-muted"
                }`}
              >
                {result.credentialStatus}
              </div>
              <span className="text-xs text-muted">
                {result.credentialStatus === "issued"
                  ? "\u2713 Checked on Flare"
                  : "\u2717 Invalid"}
              </span>
            </div>

            <div className="card text-center">
              <label className="label">Proof Validity</label>
              <div
                className={`text-lg font-bold uppercase ${
                  result.proofValid ? "text-accent" : "text-pink"
                }`}
              >
                {result.proofValid ? "Valid" : "Invalid"}
              </div>
              <span className="text-xs text-muted">
                Groth16 SNARK verification
              </span>
            </div>

            <div className="card text-center">
              <label className="label">Claim Satisfied</label>
              <div
                className={`text-lg font-bold uppercase ${
                  result.claimSatisfied ? "text-accent" : "text-pink"
                }`}
              >
                {result.claimSatisfied ? "True" : "False"}
              </div>
              <span className="text-xs text-muted">
                Threshold requirement
              </span>
            </div>
          </div>

          <div className="text-xs text-muted text-right">
            Checked at: {result.checkedAt}
          </div>
        </div>
      )}
    </div>
  );
}

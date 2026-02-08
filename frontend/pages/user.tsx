import { useState } from "react";
import { useApp } from "@/pages/_app";
import { getService, Credential, ProofResult } from "@/lib/services";
import { useRouter } from "next/router";

export default function UserPage() {
  const { demoMode, setResponseData, showToast } = useApp();
  const service = getService(demoMode);
  const router = useRouter();

  const [credQuery, setCredQuery] = useState("");
  const [credential, setCredential] = useState<(Credential & { score?: number; percentile?: number }) | null>(null);
  const [loading, setLoading] = useState(false);

  // Proof state
  const [claimType, setClaimType] = useState<"score_gte" | "percentile_gte">("percentile_gte");
  const [threshold, setThreshold] = useState("90");
  const [proving, setProving] = useState(false);
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  async function loadDemoCredential() {
    setCredQuery("demo-leon");
    setLoading(true);
    try {
      const cred = await service.getCredential("demo-leon");
      setCredential(cred as Credential & { score?: number; percentile?: number });
      setResponseData(cred);
      showToast({ type: "success", message: "Demo credential loaded" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handleLoad() {
    if (!credQuery) return;
    setLoading(true);
    try {
      const cred = await service.getCredential(credQuery);
      setCredential(cred as Credential & { score?: number; percentile?: number });
      setResponseData(cred);
      if (!cred) showToast({ type: "warning", message: "No credential found" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handleProof() {
    if (!credential) return;
    setProving(true);
    try {
      const result = await service.requestProof({
        credentialId: credential.credentialId,
        claimType,
        threshold: Number(threshold),
      });
      setProofResult(result);
      setResponseData(result);
      showToast({
        type: result.result ? "success" : "warning",
        message: result.result ? "Proof: meets requirement" : "Proof: does not meet requirement",
      });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setProving(false);
    }
  }

  function sendToVerifier() {
    if (!proofResult || !credential) return;
    const data = encodeURIComponent(
      JSON.stringify({
        credentialId: credential.credentialId,
        proof: proofResult,
      })
    );
    router.push(`/verify?data=${data}`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-1 tracking-wide">USER</h1>
        <p className="text-xs text-muted font-body">
          View your credential and generate zero-knowledge proofs
          {demoMode && <span className="badge-pink ml-2">Demo</span>}
        </p>
      </div>

      {/* Section A: My Credential */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
            My Credential
          </h2>
          <button onClick={loadDemoCredential} className="btn-secondary btn-small">
            Load Demo Credential
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="input-field flex-1"
            placeholder="Credential ID or wallet address"
            value={credQuery}
            onChange={(e) => setCredQuery(e.target.value)}
          />
          <button onClick={handleLoad} disabled={loading} className="btn-primary">
            {loading ? "..." : "Load"}
          </button>
        </div>

        {credential && (
          <div className="bg-elevated border-2 border-accent/50 p-4 space-y-3 shadow-[0_0_10px_rgba(0,255,136,0.1)]">
            <div className="flex items-center gap-2">
              <span className={credential.status === "issued" ? "badge-green" : "badge-pink"}>
                {credential.status}
              </span>
              <span className="badge-muted">{credential.domain}</span>
            </div>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted">Label: </span>
                <span className="text-white">{credential.label}</span>
              </div>
              <div>
                <span className="text-muted">Address: </span>
                <span className="text-accent break-all">{credential.userAddress}</span>
              </div>
              {credential.score !== undefined && (
                <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-border">
                  <div className="text-center">
                    <span className="text-muted text-xs block mb-1">Score</span>
                    <span className="stat-number-green">{credential.score}</span>
                  </div>
                  <div className="text-center">
                    <span className="text-muted text-xs block mb-1">Percentile</span>
                    <span className="stat-number-amber">{credential.percentile}th</span>
                  </div>
                </div>
              )}
              <div>
                <span className="text-muted">Commitment: </span>
                <span className="text-white break-all">{credential.scoreCommitment}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section B: Generate ZK Proof */}
      <section className="card space-y-4 border-t-4 border-t-pink">
        <h2 className="text-sm font-bold uppercase tracking-widest text-pink">
          Generate ZK Proof
        </h2>

        {!credential ? (
          <p className="text-xs text-muted">Load a credential first to generate a proof.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Claim Type</label>
                <select
                  className="input-field"
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value as typeof claimType)}
                >
                  <option value="score_gte">Score &ge; threshold</option>
                  <option value="percentile_gte">Percentile &ge; threshold</option>
                </select>
              </div>
              <div>
                <label className="label">Threshold (0-100)</label>
                <input
                  className="input-field"
                  type="number"
                  min="0"
                  max="100"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleProof}
              disabled={proving}
              className="btn-primary w-full"
            >
              {proving ? "Generating Proof..." : "Generate Proof"}
            </button>

            {proofResult && (
              <div className="space-y-4">
                {/* Result badge */}
                <div
                  className={`border-2 p-6 text-center ${proofResult.result
                      ? "border-accent"
                      : "border-pink"
                    }`}
                >
                  <div className={`text-4xl mb-2 ${proofResult.result ? "text-accent" : "text-pink"}`}>
                    {proofResult.result ? "\u2713" : "\u2717"}
                  </div>
                  <div className="text-sm font-bold uppercase tracking-widest">
                    {proofResult.result ? "Meets Requirement" : "Does Not Meet Requirement"}
                  </div>
                  <div className="text-xs text-muted mt-2">
                    {claimType === "score_gte" ? "Score" : "Percentile"} &ge;{" "}
                    {threshold}:{" "}
                    <span className={proofResult.result ? "text-accent" : "text-pink"}>
                      {proofResult.result ? "TRUE" : "FALSE"}
                    </span>
                  </div>
                </div>

                {/* Proof data */}
                <div className="border-2 border-border p-4">
                  <label className="label">Proof Object</label>
                  <pre className="text-xs text-accent bg-bg p-3 overflow-auto max-h-40">
                    {JSON.stringify(proofResult.proof, null, 2)}
                  </pre>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(proofResult));
                      showToast({ type: "success", message: "Proof copied" });
                    }}
                    className="btn-secondary btn-small flex-1"
                  >
                    Copy Proof
                  </button>
                  <button
                    onClick={sendToVerifier}
                    className="btn-primary btn-small flex-1"
                  >
                    Send to Verifier
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

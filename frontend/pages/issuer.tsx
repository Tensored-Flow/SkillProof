import { useState } from "react";
import { useApp } from "@/pages/_app";
import { getService, Credential } from "@/lib/services";

const DOMAINS = ["quant", "ib", "consulting", "custom"] as const;

export default function IssuerPage() {
  const { demoMode, setResponseData, showToast } = useApp();
  const service = getService(demoMode);

  // Issue form state
  const [userAddress, setUserAddress] = useState("");
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]>("quant");
  const [score, setScore] = useState("");
  const [percentile, setPercentile] = useState("");
  const [label, setLabel] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issuedCred, setIssuedCred] = useState<Credential | null>(null);
  const [issueStep, setIssueStep] = useState(0);

  // Revoke state
  const [revokeId, setRevokeId] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Lookup state
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<Credential | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  function loadDemo() {
    setUserAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    setDomain("quant");
    setScore("96");
    setPercentile("95");
    setLabel("FinCraft Quant Arena \u2013 Feb 2026");
    showToast({ type: "success", message: "Demo data loaded" });
  }

  async function handleIssue() {
    if (!userAddress || !score || !label) {
      showToast({ type: "error", message: "Fill all required fields" });
      return;
    }
    setIssuing(true);
    setIssueStep(1);
    try {
      const cred = await service.issueCredential({
        userAddress,
        domain,
        score: Number(score),
        percentile: Number(percentile),
        label,
      });
      setIssueStep(2);
      setIssuedCred(cred);
      setResponseData(cred);
      showToast({ type: "success", message: "Credential minted!" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setIssuing(false);
    }
  }

  async function handleRevoke() {
    if (!revokeId) return;
    setRevoking(true);
    try {
      await service.revokeCredential(revokeId);
      setResponseData({ revoked: revokeId, at: new Date().toISOString() });
      showToast({ type: "success", message: "Credential revoked" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setRevoking(false);
    }
  }

  async function handleLookup() {
    if (!lookupQuery) return;
    setLookingUp(true);
    try {
      const cred = await service.getCredential(lookupQuery);
      setLookupResult(cred);
      setResponseData(cred);
      if (!cred) showToast({ type: "warning", message: "No credential found" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setLookingUp(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-1 tracking-wide">ISSUER</h1>
        <p className="text-xs text-muted font-body">
          Mint, revoke, and look up soulbound credentials
          {demoMode && <span className="badge-pink ml-2">Demo</span>}
        </p>
      </div>

      {/* Section A: Issue Credential */}
      <section className="card space-y-4 border-t-4 border-t-accent">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
            Issue Credential
          </h2>
          <button onClick={loadDemo} className="btn-secondary btn-small">
            Load Demo Data
          </button>
        </div>

        <div>
          <label className="label">User Address</label>
          <input
            className="input-field"
            placeholder="0x..."
            value={userAddress}
            onChange={(e) => setUserAddress(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Skill Domain</label>
            <select
              className="input-field"
              value={domain}
              onChange={(e) => setDomain(e.target.value as typeof domain)}
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Public Label</label>
            <input
              className="input-field"
              placeholder="FinCraft Quant Arena..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Score (0-100)</label>
            <input
              className="input-field"
              type="number"
              min="0"
              max="100"
              placeholder="96"
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Percentile (0-100)</label>
            <input
              className="input-field"
              type="number"
              min="0"
              max="100"
              placeholder="95"
              value={percentile}
              onChange={(e) => setPercentile(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleIssue}
          disabled={issuing}
          className="btn-primary w-full"
        >
          {issuing ? "Minting..." : "Issue Credential"}
        </button>

        {/* Transaction timeline */}
        {issueStep > 0 && (
          <div className="border-2 border-border p-4 space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <span className={issueStep >= 1 ? "text-accent" : "text-muted"}>
                {issueStep >= 2 ? "\u2713" : "\u21BB"}
              </span>
              <span className={issueStep >= 1 ? "text-white" : "text-muted"}>
                Submitting transaction...
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className={issueStep >= 2 ? "text-accent" : "text-muted"}>
                {issueStep >= 2 ? "\u2713" : "\u2022"}
              </span>
              <span className={issueStep >= 2 ? "text-white" : "text-muted"}>
                Confirmed on-chain
              </span>
            </div>
          </div>
        )}

        {/* Result card */}
        {issuedCred && (
          <div className="border-2 border-accent p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="badge-green">Issued</span>
              {demoMode && <span className="badge-pink">Demo</span>}
            </div>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted">Credential ID: </span>
                <span className="text-white">{issuedCred.credentialId}</span>
              </div>
              <div>
                <span className="text-muted">TX Hash: </span>
                <span className="text-accent break-all">{issuedCred.txHash}</span>
              </div>
              <div>
                <span className="text-muted">Commitment: </span>
                <span className="text-white break-all">{issuedCred.scoreCommitment}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Section B: Revoke */}
      <section className="card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-pink">
          Revoke Credential
        </h2>
        <div>
          <label className="label">Credential ID</label>
          <input
            className="input-field"
            placeholder="cred-..."
            value={revokeId}
            onChange={(e) => setRevokeId(e.target.value)}
          />
        </div>
        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="btn-pink"
        >
          {revoking ? "Revoking..." : "Revoke"}
        </button>
      </section>

      {/* Section C: Lookup */}
      <section className="card space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-widest text-white">
          Lookup Credential
        </h2>
        <div>
          <label className="label">User Address or Credential ID</label>
          <input
            className="input-field"
            placeholder="0x... or cred-..."
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
          />
        </div>
        <button
          onClick={handleLookup}
          disabled={lookingUp}
          className="btn-secondary"
        >
          {lookingUp ? "Fetching..." : "Fetch Credential"}
        </button>

        {lookupResult && (
          <div className="border-2 border-border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={
                  lookupResult.status === "issued"
                    ? "badge-green"
                    : "badge-pink"
                }
              >
                {lookupResult.status}
              </span>
              <span className="badge-muted">{lookupResult.domain}</span>
            </div>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted">Label: </span>
                <span className="text-white">{lookupResult.label}</span>
              </div>
              <div>
                <span className="text-muted">Address: </span>
                <span className="text-accent break-all">
                  {lookupResult.userAddress}
                </span>
              </div>
              <div>
                <span className="text-muted">Issued: </span>
                <span className="text-white">{lookupResult.issuedAt}</span>
              </div>
              <div>
                <span className="text-muted">Commitment: </span>
                <span className="text-white break-all">
                  {lookupResult.scoreCommitment}
                </span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

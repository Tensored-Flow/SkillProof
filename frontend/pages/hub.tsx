import { useState, useEffect } from "react";
import { useApp } from "@/pages/_app";
import { getService, Credential } from "@/lib/services";
import { getHubService, Proposal, Market, Bounty } from "@/lib/services/hub-index";

type Tab = "vault" | "govern" | "predict" | "arena";

function formatTimestamp(ts: number): string {
  if (!ts) return "N/A";
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeRemaining(deadline: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = deadline - now;
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m remaining`;
}

function addr(a: string): string {
  return a.slice(0, 6) + "..." + a.slice(-4);
}

const FEED_OPTIONS = [
  { id: "0x01464c522f55534400000000000000000000000000", label: "FLR/USD", decimals: 100000 },
  { id: "0x014254432f55534400000000000000000000000000", label: "BTC/USD", decimals: 100000 },
  { id: "0x014554482f55534400000000000000000000000000", label: "ETH/USD", decimals: 100000 },
] as const;

function feedName(feedId: string): string {
  const feed = FEED_OPTIONS.find((f) => f.id.toLowerCase() === feedId.toLowerCase());
  return feed?.label ?? "Unknown";
}

function formatPrice(raw: bigint | number, feedId: string): string {
  const feed = FEED_OPTIONS.find((f) => f.id.toLowerCase() === feedId.toLowerCase());
  const decimals = feed?.decimals ?? 100000;
  return "$" + (Number(raw) / decimals).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

export default function HubPage() {
  const { demoMode, wallet, setResponseData, showToast } = useApp();
  const credService = getService(demoMode);
  const hub = getHubService(demoMode);

  const [tab, setTab] = useState<Tab>("vault");

  // ── Credential Banner ────────────────────────────────────────────────────
  const [credential, setCredential] = useState<(Credential & { score?: number; percentile?: number }) | null>(null);
  const [credLoading, setCredLoading] = useState(true);
  const [effectiveElo, setEffectiveElo] = useState<number | null>(null);
  const [reputation, setReputation] = useState<number | null>(null);
  const [effectiveVotingPower, setEffectiveVotingPower] = useState<number | null>(null);

  // ── Decay State ──
  const [decayMultiplier, setDecayMultiplier] = useState<number | null>(null);
  const [daysSinceUpdate, setDaysSinceUpdate] = useState<number | null>(null);

  useEffect(() => {
    loadCredential();
  }, [demoMode, wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCredential() {
    setCredLoading(true);
    try {
      const query = wallet || "demo-leon";
      const cred = await credService.getCredential(query);
      setCredential(cred as (Credential & { score?: number; percentile?: number }) | null);

      // Load reputation + decay data
      try {
        const addr = wallet || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
        const [elo, rep, vp, decay, days] = await Promise.all([
          hub.getEffectiveElo(addr),
          hub.getReputation(addr),
          hub.getEffectiveVotingPower(addr),
          hub.getDecayMultiplier(addr).catch(() => null),
          hub.getDaysSinceUpdate(addr).catch(() => null),
        ]);
        setEffectiveElo(elo);
        setReputation(rep);
        setEffectiveVotingPower(vp);
        setDecayMultiplier(decay);
        setDaysSinceUpdate(days);
      } catch {
        // Reputation data unavailable
      }
    } catch {
      setCredential(null);
    } finally {
      setCredLoading(false);
    }
  }

  // ── Vault State ──────────────────────────────────────────────────────────
  const [vaultBalance, setVaultBalance] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("0.1");
  const [withdrawAmt, setWithdrawAmt] = useState("0.1");
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [vaultRefreshing, setVaultRefreshing] = useState(false);

  // ── Govern State ─────────────────────────────────────────────────────────
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [votedMap, setVotedMap] = useState<Record<number, boolean>>({});
  const [govLoading, setGovLoading] = useState(false);
  const [newProposalDesc, setNewProposalDesc] = useState("");
  const [newProposalDays, setNewProposalDays] = useState("7");
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [votingId, setVotingId] = useState<number | null>(null);

  // ── Predict State ────────────────────────────────────────────────────────
  const [markets, setMarkets] = useState<Market[]>([]);
  const [predictLoading, setPredictLoading] = useState(false);
  // Per-market inline forms
  const [marketSalts, setMarketSalts] = useState<Record<number, string>>({});
  const [marketPredictions, setMarketPredictions] = useState<Record<number, boolean>>({});
  const [marketBusy, setMarketBusy] = useState<number | null>(null);
  // Create market form
  const [newMarketQuestion, setNewMarketQuestion] = useState("");
  const [newMarketFeedId, setNewMarketFeedId] = useState<string>(FEED_OPTIONS[0].id);
  const [newMarketTarget, setNewMarketTarget] = useState("1.00");
  const [newMarketCommitHours, setNewMarketCommitHours] = useState("24");
  const [newMarketRevealHours, setNewMarketRevealHours] = useState("24");
  const [creatingMarket, setCreatingMarket] = useState(false);

  // ── Arena State ──────────────────────────────────────────────────────────
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [arenaLoading, setArenaLoading] = useState(false);
  // Per-bounty inline forms
  const [bountySolutions, setBountySolutions] = useState<Record<number, string>>({});
  const [bountySalts, setBountySalts] = useState<Record<number, string>>({});
  const [bountyWinners, setBountyWinners] = useState<Record<number, string>>({});
  const [bountyBusy, setBountyBusy] = useState<number | null>(null);
  // Post bounty form
  const [newBountyDesc, setNewBountyDesc] = useState("");
  const [newBountyReward, setNewBountyReward] = useState("0.5");
  const [newBountyCommitHours, setNewBountyCommitHours] = useState("24");
  const [newBountyDurationDays, setNewBountyDurationDays] = useState("3");
  const [postingBounty, setPostingBounty] = useState(false);

  // ── Load data on tab switch ──────────────────────────────────────────────

  useEffect(() => {
    if (tab === "vault") loadVault();
    if (tab === "govern") loadProposals();
    if (tab === "predict") loadMarkets();
    if (tab === "arena") loadBounties();
  }, [tab, demoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadVault() {
    setVaultRefreshing(true);
    try {
      const [vb, ub] = await Promise.all([
        hub.getVaultBalance(),
        hub.getUserVaultBalance(wallet || "mock-user"),
      ]);
      setVaultBalance(vb);
      setUserBalance(ub);
      setResponseData({ vaultBalance: vb, userBalance: ub });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setVaultRefreshing(false);
    }
  }

  async function loadProposals() {
    setGovLoading(true);
    try {
      const count = await hub.getProposalCount();
      const ps: Proposal[] = [];
      const vm: Record<number, boolean> = {};
      for (let i = 0; i < count; i++) {
        ps.push(await hub.getProposal(i));
        vm[i] = await hub.hasVoted(i, wallet || "mock-user");
      }
      setProposals(ps);
      setVotedMap(vm);
      setResponseData({ proposalCount: count, proposals: ps });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setGovLoading(false);
    }
  }

  async function loadMarkets() {
    setPredictLoading(true);
    try {
      const count = await hub.getMarketCount();
      const ms: Market[] = [];
      for (let i = 0; i < count; i++) {
        ms.push(await hub.getMarket(i));
      }
      setMarkets(ms);
      setResponseData({
        marketCount: count,
        markets: ms.map((m) => ({ ...m, targetPrice: m.targetPrice.toString(), actualPrice: m.actualPrice.toString() })),
      });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setPredictLoading(false);
    }
  }

  async function loadBounties() {
    setArenaLoading(true);
    try {
      const count = await hub.getBountyCount();
      const bs: Bounty[] = [];
      for (let i = 0; i < count; i++) {
        bs.push(await hub.getBounty(i));
      }
      setBounties(bs);
      setResponseData({ bountyCount: count, bounties: bs });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setArenaLoading(false);
    }
  }

  // ── Vault Handlers ───────────────────────────────────────────────────────

  async function handleDeposit() {
    if (!depositAmt || parseFloat(depositAmt) <= 0) {
      showToast({ type: "error", message: "Enter a valid amount" });
      return;
    }
    setDepositing(true);
    try {
      const result = await hub.deposit(depositAmt);
      setResponseData(result);
      showToast({ type: "success", message: `Deposited ${depositAmt} C2FLR` });
      await loadVault();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setDepositing(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawAmt || parseFloat(withdrawAmt) <= 0) {
      showToast({ type: "error", message: "Enter a valid amount" });
      return;
    }
    setWithdrawing(true);
    try {
      const result = await hub.withdraw(withdrawAmt);
      setResponseData(result);
      showToast({ type: "success", message: `Withdrew ${withdrawAmt} C2FLR` });
      await loadVault();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setWithdrawing(false);
    }
  }

  // ── Govern Handlers ──────────────────────────────────────────────────────

  async function handleCreateProposal() {
    if (!newProposalDesc) {
      showToast({ type: "error", message: "Enter a proposal description" });
      return;
    }
    setCreatingProposal(true);
    try {
      const deadline = Math.floor(Date.now() / 1000) + parseInt(newProposalDays) * 86400;
      const result = await hub.createProposal(newProposalDesc, deadline);
      setResponseData(result);
      showToast({ type: "success", message: `Proposal #${result.proposalId} created` });
      setNewProposalDesc("");
      await loadProposals();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setCreatingProposal(false);
    }
  }

  async function handleVote(proposalId: number, support: boolean) {
    setVotingId(proposalId);
    try {
      const result = await hub.vote(proposalId, support);
      setResponseData(result);
      showToast({ type: "success", message: `Voted ${support ? "YES" : "NO"} on proposal #${proposalId}` });
      await loadProposals();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setVotingId(null);
    }
  }

  // ── Predict Handlers ─────────────────────────────────────────────────────

  async function handleCommitPrediction(marketId: number) {
    const salt = marketSalts[marketId];
    if (!salt) {
      showToast({ type: "error", message: "Enter a salt value" });
      return;
    }
    setMarketBusy(marketId);
    try {
      const prediction = marketPredictions[marketId] ?? true;
      const result = await hub.commitPrediction(marketId, prediction, salt);
      setResponseData(result);
      showToast({ type: "success", message: "Prediction committed" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setMarketBusy(null);
    }
  }

  async function handleRevealPrediction(marketId: number) {
    const salt = marketSalts[marketId];
    if (!salt) {
      showToast({ type: "error", message: "Enter the salt you used to commit" });
      return;
    }
    setMarketBusy(marketId);
    try {
      const prediction = marketPredictions[marketId] ?? true;
      const result = await hub.revealPrediction(marketId, prediction, salt);
      setResponseData(result);
      showToast({ type: "success", message: "Prediction revealed" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setMarketBusy(null);
    }
  }

  async function handleResolveMarket(marketId: number) {
    setMarketBusy(marketId);
    try {
      const result = await hub.resolveMarket(marketId);
      setResponseData(result);
      showToast({ type: "success", message: `Market #${marketId} resolved with Flare oracle` });
      await loadMarkets();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setMarketBusy(null);
    }
  }

  async function handleCreateMarket() {
    if (!newMarketQuestion) {
      showToast({ type: "error", message: "Enter a market question" });
      return;
    }
    setCreatingMarket(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const commitDeadline = now + parseInt(newMarketCommitHours) * 3600;
      const revealDeadline = commitDeadline + parseInt(newMarketRevealHours) * 3600;
      const targetPrice = BigInt(Math.round(parseFloat(newMarketTarget) * 100000));
      const result = await hub.createMarket(newMarketQuestion, newMarketFeedId, targetPrice, commitDeadline, revealDeadline);
      setResponseData(result);
      showToast({ type: "success", message: `Market #${result.marketId} created` });
      setNewMarketQuestion("");
      await loadMarkets();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setCreatingMarket(false);
    }
  }

  // ── Arena Handlers ───────────────────────────────────────────────────────

  async function handleCommitSolution(bountyId: number) {
    const solution = bountySolutions[bountyId];
    const salt = bountySalts[bountyId];
    if (!solution || !salt) {
      showToast({ type: "error", message: "Fill solution and salt" });
      return;
    }
    setBountyBusy(bountyId);
    try {
      const result = await hub.commitSolution(bountyId, solution, salt);
      setResponseData(result);
      showToast({ type: "success", message: "Solution committed" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setBountyBusy(null);
    }
  }

  async function handleRevealSolution(bountyId: number) {
    const solution = bountySolutions[bountyId];
    const salt = bountySalts[bountyId];
    if (!solution || !salt) {
      showToast({ type: "error", message: "Enter the EXACT solution and salt you used" });
      return;
    }
    setBountyBusy(bountyId);
    try {
      const result = await hub.revealSolution(bountyId, solution, salt);
      setResponseData(result);
      showToast({ type: "success", message: "Solution revealed" });
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setBountyBusy(null);
    }
  }

  async function handleAwardBounty(bountyId: number) {
    const winner = bountyWinners[bountyId];
    if (!winner) {
      showToast({ type: "error", message: "Enter a winner address" });
      return;
    }
    setBountyBusy(bountyId);
    try {
      const result = await hub.awardBounty(bountyId, winner);
      setResponseData(result);
      showToast({ type: "success", message: `Bounty #${bountyId} awarded` });
      await loadBounties();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setBountyBusy(null);
    }
  }

  async function handlePostBounty() {
    if (!newBountyDesc || !newBountyReward) {
      showToast({ type: "error", message: "Fill description and reward" });
      return;
    }
    setPostingBounty(true);
    try {
      const now = Math.floor(Date.now() / 1000);
      const commitDeadline = now + parseInt(newBountyCommitHours) * 3600;
      const deadline = now + parseInt(newBountyDurationDays) * 86400;
      const result = await hub.postBounty(newBountyDesc, commitDeadline, deadline, newBountyReward);
      setResponseData(result);
      showToast({ type: "success", message: `Bounty #${result.bountyId} posted` });
      setNewBountyDesc("");
      await loadBounties();
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setPostingBounty(false);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const hasCredential = !!credential && credential.status === "issued";
  const credElo = (credential as unknown as Record<string, unknown>)?.score as number | undefined;
  const credPercentile = (credential as unknown as Record<string, unknown>)?.percentile as number | undefined;
  const displayElo = effectiveElo ?? credElo ?? 0;
  const canWithdraw = hasCredential && displayElo >= 1500;

  const tabs: { key: Tab; label: string; subtitle: string }[] = [
    { key: "vault", label: "\u26A1 VAULT", subtitle: "Skill-Gated DeFi" },
    { key: "govern", label: "\uD83C\uDFDB\uFE0F GOVERN", subtitle: "Weighted Voting" },
    { key: "predict", label: "\uD83D\uDD2E PREDICT", subtitle: "Oracle Markets" },
    { key: "arena", label: "\u2694\uFE0F ARENA", subtitle: "Skill Bounties" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-bold mb-1 tracking-wide">SKILLPROOF HUB</h1>
        <p className="text-xs text-muted mt-1 font-body">
          On-chain economy gated by verified skill &mdash; not capital.
          {demoMode && <span className="badge-pink ml-2">Demo</span>}
        </p>
      </div>

      {/* ── Credential Banner ───────────────────────────────────────────── */}
      {credLoading ? (
        <div className="card border-border text-xs text-muted">Loading credential...</div>
      ) : hasCredential ? (
        <div className="bg-elevated border-2 border-accent/50 p-4 shadow-[0_0_15px_rgba(0,255,136,0.1)]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-accent text-lg">{"\u2705"}</span>
            <span className="text-sm font-bold text-white uppercase tracking-wide">
              Verified: {credential!.label}
            </span>
          </div>
          <div className="flex items-center text-xs flex-wrap font-mono">
            {credElo !== undefined && (
              <>
                <span className="text-muted">ELO</span>
                <span className="text-white font-bold ml-1">{credElo}</span>
                <span className="divider-vertical">|</span>
              </>
            )}
            {reputation !== null && (
              <>
                <span className="text-muted">REP</span>
                <span className={`font-bold ml-1 ${reputation > 0 ? "text-accent" : reputation < 0 ? "text-pink" : "text-muted"}`}>
                  {reputation > 0 ? "+" : ""}{reputation}
                </span>
                <span className="divider-vertical">|</span>
              </>
            )}
            {effectiveElo !== null && (
              <>
                <span className="text-muted">EFF</span>
                <span className="text-accent font-bold ml-1 text-sm">{effectiveElo}</span>
                <span className="divider-vertical">|</span>
              </>
            )}
            {credPercentile !== undefined && (
              <>
                <span className="text-muted">TOP</span>
                <span className="text-accent font-bold ml-1">{credPercentile}%</span>
                <span className="divider-vertical">|</span>
              </>
            )}
            {decayMultiplier !== null && (
              <>
                <span className={`font-bold ${decayMultiplier / 100 > 90 ? "text-accent animate-pulse-soft" :
                    decayMultiplier / 100 >= 70 ? "text-yellow-400 animate-pulse-soft" : "text-pink animate-pulse-soft"
                  }`}>
                  {decayMultiplier / 100 > 90 ? "\uD83D\uDFE2" : decayMultiplier / 100 >= 70 ? "\uD83D\uDFE1" : "\uD83D\uDD34"}
                  {(decayMultiplier / 100).toFixed(0)}%
                  {daysSinceUpdate !== null && ` (${daysSinceUpdate}d)`}
                </span>
                <span className="divider-vertical">|</span>
              </>
            )}
            <span className="text-accent/70">
              {addr(credential!.userAddress)}
            </span>
          </div>
          {decayMultiplier !== null && (
            <p className="text-[10px] text-muted/70 mt-2 font-body">
              Credentials decay 1% per day if not refreshed. Floor: 50%.
            </p>
          )}
        </div>
      ) : (
        <div className="card border-pink space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-pink text-lg">{"\u274C"}</span>
            <span className="text-sm font-bold text-white">
              No credential found.
            </span>
          </div>
          <p className="text-xs text-muted">
            Visit the Issuer page to get verified before using skill-gated features.
          </p>
        </div>
      )}

      {/* ── Reputation Flywheel ─────────────────────────────────────────── */}
      {hasCredential && (
        <div className="card border-border space-y-3">
          <div className="text-xs font-bold uppercase tracking-widest text-muted">REPUTATION FLYWHEEL</div>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="border-2 border-border px-3 py-1.5 text-white">{"\uD83D\uDD2E"} Win Predictions</span>
            <span className="text-accent">{"→"}</span>
            <span className="border-2 border-accent px-3 py-1.5 text-accent font-bold shadow-[0_0_10px_rgba(0,255,136,0.2)]">+10 REP</span>
            <span className="text-accent">{"→"}</span>
            <span className="border-2 border-border px-3 py-1.5 text-white">{"\u26A1"} Unlock Vault</span>
            <span className="text-accent">{"→"}</span>
            <span className="border-2 border-border px-3 py-1.5 text-white">{"\uD83C\uDFDB\uFE0F"} More Voting Power</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="border-2 border-border px-3 py-1.5 text-white">{"\u2694\uFE0F"} Win Bounties</span>
            <span className="text-accent">{"→"}</span>
            <span className="border-2 border-accent px-3 py-1.5 text-accent font-bold shadow-[0_0_10px_rgba(0,255,136,0.2)]">+15 REP</span>
            <span className="text-accent">{"↗"}</span>
          </div>
        </div>
      )}

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 flex-wrap border-2 border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 transition-all duration-200 text-left relative ${tab === t.key
                ? "bg-surface text-white border-b-0"
                : "bg-transparent text-muted hover:text-white hover:bg-surface/50"
              } ${t.key !== "vault" ? "border-l-2 border-border" : ""}`}
          >
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-accent shadow-[0_0_10px_rgba(0,255,136,0.5)]" />
            )}
            <div className="text-xs font-bold uppercase tracking-widest">{t.label}</div>
            <div className={`text-[10px] mt-0.5 font-body ${tab === t.key ? "text-accent" : "text-muted"}`}>
              {t.subtitle}
            </div>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          VAULT TAB
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === "vault" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Info Card */}
            <section className="card space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
                {"\u26A1"} Skill-Gated Vault
              </h2>
              {vaultRefreshing && !vaultBalance ? (
                <div className="space-y-4">
                  <div className="border-2 border-border p-4 text-center animate-pulse">
                    <div className="h-3 bg-border rounded w-1/2 mx-auto mb-3" />
                    <div className="h-8 bg-border rounded w-1/3 mx-auto" />
                  </div>
                  <div className="border-2 border-border p-4 text-center animate-pulse">
                    <div className="h-3 bg-border rounded w-1/2 mx-auto mb-3" />
                    <div className="h-8 bg-border rounded w-1/3 mx-auto" />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {vaultRefreshing && (
                    <p className="text-xs text-muted animate-pulse">Refreshing...</p>
                  )}
                  <div className="border-2 border-border p-4 text-center">
                    <label className="label">Total Vault Balance</label>
                    <div className="text-2xl font-bold text-accent">
                      {vaultBalance ?? "\u2014"} <span className="text-sm text-muted">C2FLR</span>
                    </div>
                  </div>
                  <div className="border-2 border-border p-4 text-center">
                    <label className="label">Your Deposit</label>
                    <div className="text-2xl font-bold text-white">
                      {userBalance ?? "\u2014"} <span className="text-sm text-muted">C2FLR</span>
                    </div>
                  </div>
                  <div className="border-2 border-border p-4 text-center">
                    <label className="label">Required ELO</label>
                    <span className="badge-pink">{"\u2265"} 1500</span>
                  </div>
                  {hasCredential && (
                    <div className="border-2 border-border p-4 text-center space-y-1">
                      <label className="label">Your Effective ELO</label>
                      <div className={`text-xl font-bold ${displayElo >= 1500 ? "text-accent" : "text-pink"}`}>
                        {displayElo}
                      </div>
                      {displayElo >= 1500 ? (
                        <p className="text-xs text-accent">{"\u2705"} Vault Access Granted</p>
                      ) : (
                        <p className="text-xs text-pink">{"\u274C"} Earn reputation to unlock (need {1500 - displayElo} more)</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Actions Card */}
            <section className="card space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                Actions
              </h2>
              <div className="space-y-3">
                <label className="label">Deposit Amount (C2FLR)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(e.target.value)}
                />
                <button
                  onClick={handleDeposit}
                  disabled={depositing}
                  className="btn-primary w-full"
                >
                  {depositing ? "Processing..." : "Deposit"}
                </button>
              </div>
              <div className="border-t border-border pt-4 space-y-3">
                <label className="label">Withdraw Amount (C2FLR)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(e.target.value)}
                />
                <button
                  onClick={handleWithdraw}
                  disabled={withdrawing || !canWithdraw}
                  className="btn-pink w-full"
                >
                  {withdrawing ? "Processing..." : "Withdraw (ELO-Gated)"}
                </button>
                {!canWithdraw && (
                  <p className="text-xs text-muted">
                    {!hasCredential
                      ? "Requires a valid credential to withdraw."
                      : `Your Effective ELO (${displayElo}) is below the 1500 threshold. Earn reputation to unlock!`}
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          GOVERN TAB
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === "govern" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
              Skill-Weighted Governance
            </h2>
            <p className="text-xs text-muted mt-1">
              Your Voting Power:{" "}
              <span className="text-accent font-bold">
                {effectiveVotingPower !== null ? effectiveVotingPower : credPercentile !== undefined ? credPercentile : "\u2014"}
              </span>
              {effectiveVotingPower !== null && credPercentile !== undefined && effectiveVotingPower !== credPercentile && (
                <span className="text-muted"> (base {credPercentile} + reputation bonus)</span>
              )}
              {(effectiveVotingPower === null || effectiveVotingPower === credPercentile) && (
                <span className="text-muted"> (based on your credential percentile)</span>
              )}
            </p>
          </div>

          {/* Proposals List */}
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                Active Proposals
              </h2>
              <button onClick={loadProposals} className="btn-secondary btn-small">
                Refresh
              </button>
            </div>
            {govLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-border rounded w-3/4" />
                <div className="h-4 bg-border rounded w-1/2" />
                <div className="h-4 bg-border rounded w-2/3" />
              </div>
            ) : proposals.length === 0 ? (
              <div className="border-2 border-border p-8 text-center">
                <p className="text-sm text-muted">No proposals yet. Create the first one below ↓</p>
              </div>
            ) : (
              <div className="space-y-4">
                {proposals.map((p) => {
                  const total = p.yesWeight + p.noWeight;
                  const yesPct = total > 0 ? Math.round((p.yesWeight / total) * 100) : 0;
                  const isActive = p.deadline > Math.floor(Date.now() / 1000);
                  const voted = votedMap[p.id];
                  return (
                    <div key={p.id} className="border-2 border-border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">Proposal #{p.id}</span>
                        <span className={isActive ? "badge-green" : "badge-muted"}>
                          {isActive ? timeRemaining(p.deadline) : "Ended"}
                        </span>
                      </div>
                      <p className="text-sm text-white font-bold">{p.description}</p>
                      <div className="text-xs text-muted">
                        Proposer: <span className="text-accent">{addr(p.proposer)}</span>
                      </div>

                      {/* Vote bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-accent">YES: {p.yesWeight}</span>
                          <span className="text-pink">NO: {p.noWeight}</span>
                        </div>
                        <div className="w-full h-2 bg-bg border border-border overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${yesPct}%` }}
                          />
                        </div>
                      </div>

                      {isActive && (
                        voted ? (
                          <div className="badge-green">You voted</div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVote(p.id, true)}
                              disabled={votingId === p.id}
                              className="btn-primary btn-small flex-1"
                            >
                              {votingId === p.id ? "Processing..." : "Vote YES"}
                            </button>
                            <button
                              onClick={() => handleVote(p.id, false)}
                              disabled={votingId === p.id}
                              className="btn-pink btn-small flex-1"
                            >
                              {votingId === p.id ? "Processing..." : "Vote NO"}
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Create Proposal */}
          <section className="card space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
              Create Proposal
            </h2>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Describe your governance proposal..."
                value={newProposalDesc}
                onChange={(e) => setNewProposalDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Voting Duration (days)</label>
              <input
                className="input-field"
                type="number"
                min="1"
                max="30"
                value={newProposalDays}
                onChange={(e) => setNewProposalDays(e.target.value)}
              />
            </div>
            <button
              onClick={handleCreateProposal}
              disabled={creatingProposal}
              className="btn-primary w-full"
            >
              {creatingProposal ? "Processing..." : "Create Proposal"}
            </button>
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PREDICT TAB
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === "predict" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
              Expert Prediction Market
            </h2>
            <p className="text-xs text-muted mt-1">
              Commit-Reveal privacy + Flare FTSO oracle resolution
            </p>
          </div>

          {/* Markets List */}
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                Markets
              </h2>
              <button onClick={loadMarkets} className="btn-secondary btn-small">
                Refresh
              </button>
            </div>
            {predictLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-border rounded w-3/4" />
                <div className="h-4 bg-border rounded w-1/2" />
                <div className="h-4 bg-border rounded w-2/3" />
              </div>
            ) : markets.length === 0 ? (
              <div className="border-2 border-border p-8 text-center">
                <p className="text-sm text-muted">No markets yet. Create the first one below ↓</p>
              </div>
            ) : (
              <div className="space-y-4">
                {markets.map((m) => {
                  const now = Math.floor(Date.now() / 1000);
                  const phase =
                    now < m.commitDeadline
                      ? "commit"
                      : now < m.revealDeadline
                        ? "reveal"
                        : m.resolved
                          ? "resolved"
                          : "awaiting";
                  const busy = marketBusy === m.id;
                  return (
                    <div key={m.id} className="border-2 border-border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">Market #{m.id}</span>
                        <span
                          className={
                            phase === "commit"
                              ? "badge-green"
                              : phase === "reveal"
                                ? "badge-pink"
                                : phase === "resolved"
                                  ? "badge-green"
                                  : "badge-muted"
                          }
                        >
                          {phase === "commit"
                            ? "Commit Phase"
                            : phase === "reveal"
                              ? "Reveal Phase"
                              : phase === "resolved"
                                ? "Resolved"
                                : "Ready to Resolve"}
                        </span>
                      </div>
                      <p className="text-sm text-white font-bold">{m.question}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted">Target: </span>
                          <span className="text-accent font-bold">{formatPrice(m.targetPrice, m.feedId)}</span>
                        </div>
                        <div>
                          <span className="text-muted">Feed: </span>
                          <span className="text-white">{feedName(m.feedId)}</span>
                        </div>
                        <div>
                          <span className="text-muted">Commit by: </span>
                          <span className="text-white">{formatTimestamp(m.commitDeadline)}</span>
                        </div>
                        <div>
                          <span className="text-muted">Reveal by: </span>
                          <span className="text-white">{formatTimestamp(m.revealDeadline)}</span>
                        </div>
                      </div>

                      {/* Phase-dependent actions */}
                      {phase === "commit" && (
                        <div className="border-t border-border pt-3 space-y-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => setMarketPredictions((p) => ({ ...p, [m.id]: true }))}
                              className={`btn-small flex-1 border-2 transition-colors ${(marketPredictions[m.id] ?? true) ? "border-accent text-accent" : "border-border text-muted"
                                }`}
                            >
                              Above Target
                            </button>
                            <button
                              onClick={() => setMarketPredictions((p) => ({ ...p, [m.id]: false }))}
                              className={`btn-small flex-1 border-2 transition-colors ${!(marketPredictions[m.id] ?? true) ? "border-pink text-pink" : "border-border text-muted"
                                }`}
                            >
                              Below Target
                            </button>
                          </div>
                          <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-3 rounded text-sm text-yellow-500">
                            {"\u26A0\uFE0F"} SAVE YOUR SALT &mdash; You must enter the exact same salt during the reveal phase. If you lose it, your prediction cannot be revealed.
                          </div>
                          <div>
                            <label className="label">{"\uD83D\uDD11"} Salt</label>
                            <input
                              className="input-field"
                              placeholder="my-secret-salt"
                              value={marketSalts[m.id] || ""}
                              onChange={(e) => setMarketSalts((s) => ({ ...s, [m.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            onClick={() => handleCommitPrediction(m.id)}
                            disabled={busy}
                            className="btn-primary w-full"
                          >
                            {busy ? "Processing..." : "Commit Prediction"}
                          </button>
                        </div>
                      )}

                      {phase === "reveal" && (
                        <div className="border-t border-border pt-3 space-y-3">
                          <p className="text-xs text-muted">
                            Enter the EXACT same prediction and salt you used to commit.
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setMarketPredictions((p) => ({ ...p, [m.id]: true }))}
                              className={`btn-small flex-1 border-2 transition-colors ${(marketPredictions[m.id] ?? true) ? "border-accent text-accent" : "border-border text-muted"
                                }`}
                            >
                              Above Target
                            </button>
                            <button
                              onClick={() => setMarketPredictions((p) => ({ ...p, [m.id]: false }))}
                              className={`btn-small flex-1 border-2 transition-colors ${!(marketPredictions[m.id] ?? true) ? "border-pink text-pink" : "border-border text-muted"
                                }`}
                            >
                              Below Target
                            </button>
                          </div>
                          <div>
                            <label className="label">Salt</label>
                            <input
                              className="input-field"
                              placeholder="my-secret-salt"
                              value={marketSalts[m.id] || ""}
                              onChange={(e) => setMarketSalts((s) => ({ ...s, [m.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            onClick={() => handleRevealPrediction(m.id)}
                            disabled={busy}
                            className="btn-pink w-full"
                          >
                            {busy ? "Processing..." : "Reveal Prediction"}
                          </button>
                        </div>
                      )}

                      {phase === "awaiting" && (
                        <div className="border-t border-border pt-3">
                          <button
                            onClick={() => handleResolveMarket(m.id)}
                            disabled={busy}
                            className="btn-primary w-full"
                          >
                            {busy ? "Processing..." : "\uD83D\uDD2E Resolve with Flare Oracle"}
                          </button>
                        </div>
                      )}

                      {phase === "resolved" && (
                        <div className="border-t border-border pt-3 space-y-1">
                          <div className="text-xs">
                            <span className="text-accent">{"\uD83D\uDD2E"} Resolved</span>
                            <span className="text-muted"> &mdash; Actual Price: </span>
                            <span className="text-accent font-bold">
                              {formatPrice(m.actualPrice, m.feedId)}
                            </span>
                          </div>
                          <div className="text-xs">
                            <span className="text-muted">Result: </span>
                            <span className={Number(m.actualPrice) >= Number(m.targetPrice) ? "text-accent font-bold" : "text-pink font-bold"}>
                              {feedName(m.feedId).split("/")[0]} {Number(m.actualPrice) >= Number(m.targetPrice) ? "DID" : "DID NOT"} exceed target
                            </span>
                          </div>
                          <div className="text-xs border-t border-border pt-1 mt-1">
                            <span className="text-muted">Reputation Impact: </span>
                            <span className="text-accent">Correct +10</span>
                            <span className="text-muted"> / </span>
                            <span className="text-pink">Incorrect -5</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Create Market */}
          <section className="card space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
              Create Market
            </h2>
            <div>
              <label className="label">Question</label>
              <input
                className="input-field"
                placeholder="Will FLR exceed $X by...?"
                value={newMarketQuestion}
                onChange={(e) => setNewMarketQuestion(e.target.value)}
              />
            </div>
            <div>
              <label className="label">FTSO Feed</label>
              <select
                className="input-field"
                value={newMarketFeedId}
                onChange={(e) => setNewMarketFeedId(e.target.value)}
              >
                {FEED_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Target Price ($)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newMarketTarget}
                  onChange={(e) => setNewMarketTarget(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Commit Window (hrs)</label>
                <input
                  className="input-field"
                  type="number"
                  min="1"
                  value={newMarketCommitHours}
                  onChange={(e) => setNewMarketCommitHours(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Reveal Window (hrs)</label>
                <input
                  className="input-field"
                  type="number"
                  min="1"
                  value={newMarketRevealHours}
                  onChange={(e) => setNewMarketRevealHours(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={handleCreateMarket}
              disabled={creatingMarket}
              className="btn-primary w-full"
            >
              {creatingMarket ? "Processing..." : "Create Market"}
            </button>
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          ARENA TAB
          ═══════════════════════════════════════════════════════════════════ */}
      {tab === "arena" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
              Anonymous Skill Bounties
            </h2>
            <p className="text-xs text-muted mt-1">
              Prove skills anonymously. Get paid for expertise.
            </p>
          </div>

          {/* Bounties List */}
          <section className="card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-white">
                Bounties
              </h2>
              <button onClick={loadBounties} className="btn-secondary btn-small">
                Refresh
              </button>
            </div>
            {arenaLoading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-border rounded w-3/4" />
                <div className="h-4 bg-border rounded w-1/2" />
                <div className="h-4 bg-border rounded w-2/3" />
              </div>
            ) : bounties.length === 0 ? (
              <div className="border-2 border-border p-8 text-center">
                <p className="text-sm text-muted">No bounties yet. Post the first one below ↓</p>
              </div>
            ) : (
              <div className="space-y-4">
                {bounties.map((b) => {
                  const now = Math.floor(Date.now() / 1000);
                  const phase =
                    now < b.commitDeadline
                      ? "commit"
                      : now < b.deadline
                        ? "reveal"
                        : b.awarded
                          ? "awarded"
                          : "judging";
                  const busy = bountyBusy === b.id;
                  const isPoster = wallet
                    ? wallet.toLowerCase() === b.poster.toLowerCase()
                    : false;
                  return (
                    <div key={b.id} className="border-2 border-border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted">Bounty #{b.id}</span>
                        <div className="flex items-center gap-2">
                          <span className="badge-green">{"\uD83D\uDCB0"} {b.reward} C2FLR</span>
                          <span
                            className={
                              phase === "commit"
                                ? "badge-green"
                                : phase === "reveal"
                                  ? "badge-pink"
                                  : phase === "awarded"
                                    ? "badge-green"
                                    : "badge-muted"
                            }
                          >
                            {phase === "commit"
                              ? "Accepting Submissions"
                              : phase === "reveal"
                                ? "Reveal Phase"
                                : phase === "awarded"
                                  ? `\uD83C\uDFC6 Awarded to ${addr(b.winner)}`
                                  : "Judging"}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-white font-bold">{b.description}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted">{"\uD83D\uDCEE"} Posted by: </span>
                          <span className="text-accent">{addr(b.poster)}</span>
                        </div>
                        <div>
                          <span className="text-muted">Commit by: </span>
                          <span className="text-white">{formatTimestamp(b.commitDeadline)}</span>
                        </div>
                        <div>
                          <span className="text-muted">Deadline: </span>
                          <span className="text-white">{formatTimestamp(b.deadline)}</span>
                        </div>
                      </div>

                      {/* Phase-dependent actions */}
                      {phase === "commit" && (
                        <div className="border-t border-border pt-3 space-y-3">
                          <div>
                            <label className="label">Solution</label>
                            <input
                              className="input-field"
                              placeholder="Your solution..."
                              value={bountySolutions[b.id] || ""}
                              onChange={(e) => setBountySolutions((s) => ({ ...s, [b.id]: e.target.value }))}
                            />
                          </div>
                          <div className="border-2 border-yellow-500/50 bg-yellow-500/10 p-3 rounded text-sm text-yellow-500">
                            {"\u26A0\uFE0F"} SAVE YOUR SALT &mdash; You must enter the exact same solution and salt during the reveal phase. If you lose them, your submission cannot be revealed.
                          </div>
                          <div>
                            <label className="label">{"\uD83D\uDD11"} Salt</label>
                            <input
                              className="input-field"
                              placeholder="my-secret-salt"
                              value={bountySalts[b.id] || ""}
                              onChange={(e) => setBountySalts((s) => ({ ...s, [b.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            onClick={() => handleCommitSolution(b.id)}
                            disabled={busy}
                            className="btn-primary w-full"
                          >
                            {busy ? "Processing..." : "Commit Solution"}
                          </button>
                        </div>
                      )}

                      {phase === "reveal" && (
                        <div className="border-t border-border pt-3 space-y-3">
                          <p className="text-xs text-muted">
                            Enter the EXACT same solution and salt you used to commit.
                          </p>
                          <div>
                            <label className="label">Solution</label>
                            <input
                              className="input-field"
                              placeholder="Your solution..."
                              value={bountySolutions[b.id] || ""}
                              onChange={(e) => setBountySolutions((s) => ({ ...s, [b.id]: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label">Salt</label>
                            <input
                              className="input-field"
                              placeholder="my-secret-salt"
                              value={bountySalts[b.id] || ""}
                              onChange={(e) => setBountySalts((s) => ({ ...s, [b.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            onClick={() => handleRevealSolution(b.id)}
                            disabled={busy}
                            className="btn-pink w-full"
                          >
                            {busy ? "Processing..." : "Reveal Solution"}
                          </button>
                        </div>
                      )}

                      {phase === "awarded" && (
                        <div className="border-t border-border pt-3 text-xs">
                          <span className="text-muted">Winner earned </span>
                          <span className="text-accent font-bold">+15 reputation</span>
                        </div>
                      )}

                      {phase === "judging" && isPoster && (
                        <div className="border-t border-border pt-3 space-y-3">
                          <div>
                            <label className="label">Winner Address</label>
                            <input
                              className="input-field"
                              placeholder="0x..."
                              value={bountyWinners[b.id] || ""}
                              onChange={(e) => setBountyWinners((s) => ({ ...s, [b.id]: e.target.value }))}
                            />
                          </div>
                          <button
                            onClick={() => handleAwardBounty(b.id)}
                            disabled={busy}
                            className="btn-primary w-full"
                          >
                            {busy ? "Processing..." : "\uD83C\uDFC6 Award Bounty"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Post Bounty */}
          <section className="card space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
              Post Bounty
            </h2>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input-field min-h-[80px]"
                placeholder="Describe the bounty challenge..."
                value={newBountyDesc}
                onChange={(e) => setNewBountyDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Reward (C2FLR)</label>
                <input
                  className="input-field"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBountyReward}
                  onChange={(e) => setNewBountyReward(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Commit Window (hrs)</label>
                <input
                  className="input-field"
                  type="number"
                  min="1"
                  value={newBountyCommitHours}
                  onChange={(e) => setNewBountyCommitHours(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Duration (days)</label>
                <input
                  className="input-field"
                  type="number"
                  min="1"
                  value={newBountyDurationDays}
                  onChange={(e) => setNewBountyDurationDays(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={handlePostBounty}
              disabled={postingBounty}
              className="btn-pink w-full"
            >
              {postingBounty ? "Processing..." : "\uD83D\uDCB0 Post Bounty"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

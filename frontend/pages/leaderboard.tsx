import { useState, useEffect, useCallback } from "react";
import { useApp } from "@/pages/_app";
import { getHubService, LeaderboardEntry, AggregateScore } from "@/lib/services/hub-index";

export default function LeaderboardPage() {
  const { demoMode, setResponseData, showToast } = useApp();
  const service = getHubService(demoMode);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [viewMode, setViewMode] = useState<"issuer" | "aggregate">("issuer");
  const [aggregateScores, setAggregateScores] = useState<Record<string, AggregateScore>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await service.getLeaderboardData();
      setEntries(data);
      setResponseData(data);

      // Fetch aggregate scores for all unique addresses
      const uniqueAddrs = Array.from(new Set(data.map((e) => e.address)));
      const aggMap: Record<string, AggregateScore> = {};
      for (const addr of uniqueAddrs) {
        try {
          const score = await service.getAggregateScore(addr);
          if (score.issuerCount > 0) aggMap[addr] = score;
        } catch { /* skip */ }
      }
      setAggregateScores(aggMap);
    } catch (e) {
      showToast({ type: "error", message: (e as Error).message });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleExpand(idx: number) {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }

  function repColor(rep: number) {
    if (rep > 0) return "text-accent";
    if (rep < 0) return "text-pink";
    return "text-muted";
  }

  function rankLabel(idx: number) {
    if (idx === 0) return "#1";
    if (idx === 1) return "#2";
    if (idx === 2) return "#3";
    return `#${idx + 1}`;
  }

  function rankClass(idx: number) {
    if (idx === 0) return "text-accent text-2xl font-bold";
    if (idx === 1) return "text-amber-500 text-xl font-bold";
    if (idx === 2) return "text-amber-500 text-xl font-bold";
    return "text-muted text-lg font-bold";
  }

  function eloTierColor(elo: number) {
    if (elo >= 1800) return "text-accent";
    if (elo >= 1500) return "text-amber-500";
    return "text-muted";
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold mb-1 tracking-wide">LEADERBOARD</h1>
        <p className="text-xs text-muted font-body">
          All credentialed users ranked by effective ELO (base + reputation)
          {demoMode && <span className="badge-pink ml-2">Demo</span>}
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <span className="label">Players</span>
          <div className="stat-number-green mt-1">
            {loading ? "-" : entries.length}
          </div>
        </div>
        <div className="card text-center">
          <span className="label">Issuers</span>
          <div className="stat-number-amber mt-1">
            {loading ? "-" : Array.from(new Set(entries.map((e) => e.issuer))).length}
          </div>
        </div>
        <div className="card text-center">
          <span className="label">Top ELO</span>
          <div className="stat-number-green mt-1">
            {loading ? "-" : entries[0]?.effectiveElo ?? "-"}
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex border-2 border-border">
        <button
          onClick={() => setViewMode("issuer")}
          className={`flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-widest transition-all duration-200 ${viewMode === "issuer"
              ? "bg-accent text-bg"
              : "bg-transparent text-muted hover:text-white hover:bg-surface/50"
            }`}
        >
          Per-Issuer
        </button>
        <button
          onClick={() => setViewMode("aggregate")}
          className={`flex-1 px-4 py-2.5 text-xs font-bold uppercase tracking-widest border-l-2 border-border transition-all duration-200 ${viewMode === "aggregate"
              ? "bg-cyan-500 text-bg"
              : "bg-transparent text-muted hover:text-white hover:bg-surface/50"
            }`}
        >
          {"🌐"} Aggregate
        </button>
      </div>

      {/* Leaderboard table */}
      <section className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-border">
          <h2 className="text-sm font-bold uppercase tracking-widest text-accent">
            {viewMode === "aggregate" ? "\uD83C\uDF10 Aggregate Rankings" : "Rankings"}
          </h2>
          <button onClick={load} disabled={loading} className="btn-secondary btn-small">
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-4">
                <div className="w-10 h-10 bg-border rounded" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-border rounded w-1/3" />
                  <div className="h-3 bg-border rounded w-1/2" />
                </div>
                <div className="w-16 h-6 bg-border rounded" />
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center border-2 border-dashed border-border m-6">
            <p className="text-sm text-muted">No credentialed users found.</p>
          </div>
        ) : viewMode === "aggregate" ? (
          /* ── Aggregate View ──────────────────────────────────────── */
          <div className="divide-y-2 divide-border">
            {(() => {
              // Build unique players by address, merge across issuers
              const playerMap = new Map<string, { name: string; entries: LeaderboardEntry[] }>();
              for (const e of entries) {
                const existing = playerMap.get(e.address);
                if (existing) {
                  existing.entries.push(e);
                } else {
                  playerMap.set(e.address, { name: e.playerName, entries: [e] });
                }
              }
              // Build aggregate rows
              const aggRows = Array.from(playerMap.entries()).map(([addr, { name, entries: es }]) => {
                const agg = aggregateScores[addr];
                if (agg && agg.issuerCount > 1) {
                  return { address: addr, playerName: name, ...agg };
                }
                // Single-issuer fallback
                const e = es[0];
                return {
                  address: addr,
                  playerName: name,
                  compositeElo: e.overallElo,
                  compositePercentile: e.percentile,
                  totalMatches: e.totalMatches,
                  issuerCount: 1,
                  domainCount: e.skillDomains.length,
                  crossDomainBonus: 0,
                  overallScore: e.effectiveElo,
                };
              });
              aggRows.sort((a, b) => b.overallScore - a.overallScore);

              return aggRows.map((row, idx) => (
                <div key={row.address} className="px-6 py-4 flex items-center gap-4">
                  <div className={`w-10 text-center ${rankClass(idx)}`}>
                    {rankLabel(idx)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">
                        {row.playerName}
                      </span>
                      {row.issuerCount > 1 && (
                        <span className="badge-cyan text-[10px]">
                          {"🌐"} Multi-Issuer
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {row.address.slice(0, 6)}...{row.address.slice(-4)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted">
                      <span>Composite ELO: <span className="text-white font-bold">{row.compositeElo}</span></span>
                      {row.crossDomainBonus > 0 && (
                        <span>+ Cross-domain: <span className="text-accent font-bold">+{row.crossDomainBonus}</span></span>
                      )}
                      <span>{row.issuerCount} issuer{row.issuerCount !== 1 ? "s" : ""}</span>
                      <span>{row.domainCount} domains</span>
                    </div>
                  </div>
                  <div className="text-right w-20">
                    <div className="text-lg font-bold text-accent">
                      {row.overallScore}
                    </div>
                    <div className="text-[10px] text-muted">overall</div>
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
          /* ── Per-Issuer View ─────────────────────────────────────── */
          <div className="divide-y-2 divide-border">
            {entries.map((entry, idx) => (
              <div key={`${entry.address}-${entry.issuer}`} className={idx % 2 === 1 ? "bg-surface/30" : ""}>
                {/* Main row */}
                <button
                  onClick={() => toggleExpand(idx)}
                  className="w-full px-6 py-4 flex items-center gap-4 hover:bg-surface/50 transition-colors text-left"
                >
                  {/* Rank */}
                  <div className={`w-10 text-center ${rankClass(idx)}`}>
                    {rankLabel(idx)}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white truncate">
                        {entry.playerName}
                      </span>
                      <span className="badge-muted text-[10px]">{entry.issuer}</span>
                      {aggregateScores[entry.address]?.issuerCount > 1 && (
                        <span className="badge-cyan text-[10px]">
                          {"🌐"} Multi
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                    </div>
                  </div>

                  {/* Reputation */}
                  <div className="text-right">
                    <span className={`text-xs ${repColor(entry.reputationBonus)}`}>
                      {entry.reputationBonus > 0 ? "+" : ""}
                      {entry.reputationBonus} rep
                    </span>
                  </div>

                  {/* Effective ELO */}
                  <div className="text-right w-20">
                    <div className={`text-xl font-bold ${eloTierColor(entry.effectiveElo)}`}>
                      {entry.effectiveElo}
                    </div>
                    {entry.reputationBonus !== 0 && (
                      <div className="text-[10px] text-muted">
                        base {entry.overallElo}
                      </div>
                    )}
                  </div>

                  {/* Expand indicator */}
                  <div className="text-muted text-xs w-4">
                    {expanded[idx] ? "\u25B2" : "\u25BC"}
                  </div>
                </button>

                {/* Expanded details */}
                {expanded[idx] && (
                  <div className="px-6 pb-4 bg-bg border-t border-border">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3">
                      <div>
                        <span className="label">Percentile</span>
                        <div className="text-sm font-bold text-white">{entry.percentile}th</div>
                      </div>
                      <div>
                        <span className="label">Matches</span>
                        <div className="text-sm font-bold text-white">{entry.totalMatches}</div>
                      </div>
                      <div>
                        <span className="label">Win Rate</span>
                        <div className="text-sm font-bold text-white">{entry.winRate}%</div>
                      </div>
                      <div>
                        <span className="label">Issuer</span>
                        <div className="text-sm font-bold text-white">{entry.issuer}</div>
                      </div>
                    </div>

                    {/* Skill domains */}
                    <div className="pt-2 border-t border-border">
                      <span className="label">Skill Domains</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {entry.skillDomains.map((d) => (
                          <span key={d} className="badge-muted text-[10px]">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Reputation breakdown */}
                    <div className="pt-3 border-t border-border mt-3">
                      <span className="label">ELO Breakdown</span>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="text-muted">Base ELO:</span>
                        <span className="text-white font-bold">{entry.overallElo}</span>
                        <span className="text-muted">+</span>
                        <span className="text-muted">Reputation:</span>
                        <span className={`font-bold ${repColor(entry.reputationBonus)}`}>
                          {entry.reputationBonus > 0 ? "+" : ""}{entry.reputationBonus}
                        </span>
                        <span className="text-muted">=</span>
                        <span className="text-accent font-bold">{entry.effectiveElo}</span>
                      </div>
                    </div>

                    {/* Aggregate score (if multi-issuer) */}
                    {aggregateScores[entry.address]?.issuerCount > 1 && (
                      <div className="pt-3 border-t border-border mt-3">
                        <span className="label">{"\uD83C\uDF10"} Aggregate Score</span>
                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="text-muted">Composite:</span>
                          <span className="text-white font-bold">{aggregateScores[entry.address].compositeElo}</span>
                          <span className="text-muted">+</span>
                          <span className="text-muted">Cross-domain:</span>
                          <span className="text-accent font-bold">+{aggregateScores[entry.address].crossDomainBonus}</span>
                          <span className="text-muted">=</span>
                          <span className="text-accent font-bold">{aggregateScores[entry.address].overallScore}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

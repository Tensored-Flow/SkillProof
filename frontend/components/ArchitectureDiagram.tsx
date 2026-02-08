// Architecture Diagram — Interactive SVG component
// Shows the 9-contract SkillProof Protocol architecture with hover tooltips

import { useState } from "react";

// Contract metadata for interactive tooltips
const contractInfo: Record<string, { name: string; description: string; features: string[]; color: string }> = {
    registry: {
        name: "SkillProofRegistry",
        description: "Core identity layer for soulbound skill credentials. Non-transferable NFTs that represent verified skills.",
        features: ["Soulbound tokens (non-transferable)", "Multi-issuer support", "On-chain skill verification", "ELO/percentile storage"],
        color: "#00FF88"
    },
    attestor: {
        name: "Attestor",
        description: "Anchors credential data to Flare's FTSO oracle for tamper-proof timestamping.",
        features: ["FTSO price feeds", "Timestamp anchoring", "Cross-chain attestation", "Data integrity proofs"],
        color: "#F59E0B"
    },
    verifier: {
        name: "Verifier",
        description: "Merkle tree verification for privacy-preserving credential proofs.",
        features: ["Merkle inclusion proofs", "Threshold verification", "Batch verification", "Gas-optimized"],
        color: "#F59E0B"
    },
    groth16: {
        name: "Groth16Verifier",
        description: "On-chain ZK-SNARK verification engine using Groth16 proofs.",
        features: ["32 constraint circuit", "Circom v2.2.3", "Sub-second verification", "Constant gas cost"],
        color: "#F59E0B"
    },
    zkverifier: {
        name: "ZKVerifier",
        description: "High-level ZK wrapper for threshold proofs (prove ELO ≥ X without revealing exact score).",
        features: ["Privacy-preserving", "Threshold claims", "Groth16 backend", "Commitment scheme"],
        color: "#F59E0B"
    },
    hub: {
        name: "SkillProofHub",
        description: "Central application layer with skill-gated DeFi, governance, prediction markets, and bounties.",
        features: ["4 integrated modules", "Skill gating logic", "Reputation flywheel", "Cross-module composability"],
        color: "#FFFFFF"
    },
    decay: {
        name: "Decay",
        description: "Temporal freshness decay — skills degrade over time without activity.",
        features: ["Configurable half-life", "Activity refresh", "Staleness detection", "Fair credential aging"],
        color: "#A855F7"
    },
    aggregator: {
        name: "Aggregator",
        description: "Combines credentials across multiple issuers into composite skill scores.",
        features: ["Cross-issuer composite", "Weighted averaging", "Skill categorization", "Meta-credentials"],
        color: "#06B6D4"
    },
    staking: {
        name: "Staking",
        description: "Economic security layer — stake tokens to boost credential weight.",
        features: ["Credential staking", "Slashing conditions", "Yield mechanics", "Reputation boost"],
        color: "#F59E0B"
    },
    oracle: {
        name: "Flare FTSOv2",
        description: "Decentralized oracle providing real-time price feeds with block-latency updates.",
        features: ["FLR/USD, BTC/USD, ETH/USD", "Block-latency feeds", "90+ data providers", "Byzantine fault tolerant"],
        color: "#00FF88"
    },
    vault: {
        name: "Vault Module",
        description: "ELO-gated DeFi vault — only skilled players can access premium yield.",
        features: ["Skill-gated deposits", "Tiered access", "Premium APY", "Risk-weighted"],
        color: "#00FF88"
    },
    govern: {
        name: "Governance Module",
        description: "DAO governance with ELO-weighted voting power.",
        features: ["Skill-weighted votes", "Proposal creation", "Quadratic voting option", "On-chain execution"],
        color: "#A855F7"
    },
    predict: {
        name: "Prediction Module",
        description: "Oracle-powered prediction markets for skill-related outcomes.",
        features: ["Market creation", "FTSO resolution", "Skill-gated participation", "AMM liquidity"],
        color: "#FF0080"
    },
    arena: {
        name: "Arena Module",
        description: "Skill bounty system for competitive challenges.",
        features: ["Bounty creation", "Skill matching", "Escrow system", "Dispute resolution"],
        color: "#06B6D4"
    }
};

export default function ArchitectureDiagram() {
    const [hoveredContract, setHoveredContract] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0, showBelow: false });

    const handleMouseEnter = (contractId: string, e: React.MouseEvent) => {
        setHoveredContract(contractId);
        const rect = e.currentTarget.getBoundingClientRect();
        const parentRect = e.currentTarget.closest('svg')?.getBoundingClientRect();
        if (parentRect) {
            // Check if tooltip would go above visible area (need ~150px for tooltip height)
            const showBelow = (rect.top - parentRect.top) < 150;
            setTooltipPos({
                x: rect.left - parentRect.left + rect.width / 2,
                y: showBelow
                    ? rect.bottom - parentRect.top + 10  // below element
                    : rect.top - parentRect.top - 10,     // above element
                showBelow
            });
        }
    };

    const handleMouseLeave = () => {
        setHoveredContract(null);
    };

    const isHighlighted = (id: string) => hoveredContract === id;
    const isRelated = (id: string) => {
        if (!hoveredContract) return false;
        const relations: Record<string, string[]> = {
            registry: ["attestor", "verifier", "hub"],
            attestor: ["registry", "oracle"],
            verifier: ["registry", "hub"],
            groth16: ["zkverifier"],
            zkverifier: ["groth16", "hub"],
            hub: ["registry", "verifier", "zkverifier", "decay", "aggregator", "staking", "vault", "govern", "predict", "arena"],
            decay: ["hub"],
            aggregator: ["hub", "oracle"],
            staking: ["hub"],
            oracle: ["attestor", "aggregator", "predict"],
            vault: ["hub"],
            govern: ["hub"],
            predict: ["hub", "oracle"],
            arena: ["hub"]
        };
        return relations[hoveredContract]?.includes(id) || false;
    };

    const getOpacity = (id: string) => {
        if (!hoveredContract) return 1;
        if (isHighlighted(id) || isRelated(id)) return 1;
        return 0.3;
    };

    const getStrokeWidth = (id: string, base: number) => {
        if (isHighlighted(id)) return base + 2;
        if (isRelated(id)) return base + 1;
        return base;
    };

    const info = hoveredContract ? contractInfo[hoveredContract] : null;

    return (
        <div className="w-full overflow-x-auto relative overflow-y-visible">
            {/* Tooltip */}
            {info && (
                <div
                    className="absolute z-50 pointer-events-none animate-fade-in"
                    style={{
                        left: `${tooltipPos.x}px`,
                        top: `${tooltipPos.y}px`,
                        transform: tooltipPos.showBelow
                            ? 'translate(-50%, 0)'      // below: anchor at top
                            : 'translate(-50%, -100%)'  // above: anchor at bottom
                    }}
                >
                    {/* Arrow pointing UP (when tooltip is below) */}
                    {tooltipPos.showBelow && (
                        <div
                            className="w-3 h-3 rotate-45 mx-auto mb-[-6px] relative z-10"
                            style={{ backgroundColor: info.color }}
                        />
                    )}
                    <div
                        className="bg-[#0a0a0a] border p-4 max-w-xs shadow-2xl relative z-0"
                        style={{ borderColor: info.color, boxShadow: `0 0 20px ${info.color}30` }}
                    >
                        <div className="font-bold text-sm mb-1" style={{ color: info.color }}>{info.name}</div>
                        <div className="text-xs text-[#999] mb-3 leading-relaxed">{info.description}</div>
                        <div className="space-y-1">
                            {info.features.map((f, i) => (
                                <div key={i} className="text-[10px] text-[#666] flex items-center gap-2">
                                    <span style={{ color: info.color }}>›</span>
                                    {f}
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Arrow pointing DOWN (when tooltip is above) */}
                    {!tooltipPos.showBelow && (
                        <div
                            className="w-3 h-3 rotate-45 mx-auto -mt-1.5"
                            style={{ backgroundColor: info.color }}
                        />
                    )}
                </div>
            )}

            <svg
                viewBox="0 0 900 580"
                className="w-full min-w-[800px] h-auto transition-all duration-300"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
                {/* Definitions */}
                <defs>
                    {/* Arrow markers */}
                    <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#00FF88" />
                    </marker>
                    <marker id="arrow-gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#666666" />
                    </marker>
                    <marker id="arrow-pink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#FF0080" />
                    </marker>

                    {/* Glow filters */}
                    <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="glow-amber" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="glow-pink" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="glow-purple" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="glow-cyan" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Pulse animation */}
                    <style>{`
                        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
                        @keyframes flowPulse { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -20; } }
                        .pulse { animation: pulse 2s ease-in-out infinite; }
                        .flow-line { animation: flowPulse 1s linear infinite; }
                        .contract-box { cursor: pointer; transition: all 0.2s ease; }
                        .contract-box:hover { filter: brightness(1.2); }
                    `}</style>
                </defs>

                {/* Background */}
                <rect x="0" y="0" width="900" height="580" fill="#0A0A0A" />

                {/* Protocol boundary box */}
                <rect x="160" y="10" width="730" height="560" fill="none" stroke="#222222" strokeWidth="1" strokeDasharray="4,4" rx="4" />
                <text x="175" y="30" fill="#666666" fontSize="10" fontWeight="bold">SKILLPROOF PROTOCOL (9 CONTRACTS)</text>

                {/* Hint text */}
                <text x="480" y="30" fill="#444444" fontSize="9" textAnchor="middle" fontStyle="italic">
                    Hover over contracts to learn more
                </text>

                {/* ═══════════════════════════════════════════════════════════════════
                    LAYER 0: ISSUERS (External, left side)
                    ═══════════════════════════════════════════════════════════════════ */}

                {/* FinCraft Arena */}
                <g style={{ opacity: getOpacity("issuer") }}>
                    <rect x="20" y="60" width="120" height="60" fill="#111111" stroke="#444444" strokeWidth="1" rx="2" />
                    <text x="80" y="85" fill="#888888" fontSize="11" fontWeight="bold" textAnchor="middle">FinCraft Arena</text>
                    <text x="80" y="100" fill="#666666" fontSize="8" textAnchor="middle">Game Engine</text>
                    <text x="80" y="112" fill="#00FF88" fontSize="8" textAnchor="middle">ELO: 1847</text>
                </g>

                {/* ChessArena */}
                <g style={{ opacity: getOpacity("issuer") }}>
                    <rect x="20" y="130" width="120" height="50" fill="#111111" stroke="#444444" strokeWidth="1" rx="2" />
                    <text x="80" y="155" fill="#888888" fontSize="11" fontWeight="bold" textAnchor="middle">ChessArena</text>
                    <text x="80" y="168" fill="#666666" fontSize="8" textAnchor="middle">Rating: 2100</text>
                </g>

                {/* Arrows from issuers to Registry */}
                <g style={{ opacity: getOpacity("registry") }}>
                    <line x1="140" y1="90" x2="195" y2="90" stroke="#00FF88" strokeWidth="1.5" markerEnd="url(#arrow-green)" className={hoveredContract === "registry" ? "flow-line" : ""} strokeDasharray={hoveredContract === "registry" ? "5,5" : "none"} />
                    <line x1="140" y1="155" x2="175" y2="155" stroke="#00FF88" strokeWidth="1.5" />
                    <line x1="175" y1="155" x2="175" y2="90" stroke="#00FF88" strokeWidth="1.5" />
                    <line x1="175" y1="90" x2="195" y2="90" stroke="#00FF88" strokeWidth="1.5" />
                </g>

                {/* ═══════════════════════════════════════════════════════════════════
                    LAYER 1: IDENTITY — Registry (core)
                    ═══════════════════════════════════════════════════════════════════ */}

                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("registry") }}
                    onMouseEnter={(e) => handleMouseEnter("registry", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("registry") ? "url(#glow-green)" : undefined}
                >
                    <rect
                        x="210" y="50" width="280" height="80"
                        fill="#111111"
                        stroke="#00FF88"
                        strokeWidth={getStrokeWidth("registry", 2)}
                        rx="4"
                        className={isHighlighted("registry") ? "" : "pulse"}
                    />
                    <text x="350" y="80" fill="#00FF88" fontSize="14" fontWeight="bold" textAnchor="middle">SkillProofRegistry</text>
                    <text x="350" y="98" fill="#666666" fontSize="10" textAnchor="middle">Soulbound Credentials • Core Identity Layer</text>
                    <text x="350" y="115" fill="#444444" fontSize="8" textAnchor="middle">mint • revoke • lookup • transfer-locked</text>
                </g>

                {/* ═══════════════════════════════════════════════════════════════════
                    LAYER 2: VERIFICATION (4 contracts side by side)
                    ═══════════════════════════════════════════════════════════════════ */}

                {/* Attestor */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("attestor") }}
                    onMouseEnter={(e) => handleMouseEnter("attestor", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("attestor") ? "url(#glow-amber)" : undefined}
                >
                    <rect x="180" y="160" width="130" height="65" fill="#111111" stroke="#F59E0B" strokeWidth={getStrokeWidth("attestor", 2)} rx="3" />
                    <text x="245" y="185" fill="#F59E0B" fontSize="11" fontWeight="bold" textAnchor="middle">Attestor</text>
                    <text x="245" y="200" fill="#666666" fontSize="8" textAnchor="middle">FTSO Oracle Anchor</text>
                    <text x="245" y="212" fill="#444444" fontSize="8" textAnchor="middle">timestamps + prices</text>
                </g>

                {/* Verifier */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("verifier") }}
                    onMouseEnter={(e) => handleMouseEnter("verifier", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("verifier") ? "url(#glow-amber)" : undefined}
                >
                    <rect x="320" y="160" width="130" height="65" fill="#111111" stroke="#F59E0B" strokeWidth={getStrokeWidth("verifier", 2)} rx="3" />
                    <text x="385" y="185" fill="#F59E0B" fontSize="11" fontWeight="bold" textAnchor="middle">Verifier</text>
                    <text x="385" y="200" fill="#666666" fontSize="8" textAnchor="middle">Merkle Proofs</text>
                    <text x="385" y="212" fill="#444444" fontSize="8" textAnchor="middle">inclusion + threshold</text>
                </g>

                {/* Groth16 */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("groth16") }}
                    onMouseEnter={(e) => handleMouseEnter("groth16", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("groth16") ? "url(#glow-amber)" : undefined}
                >
                    <rect x="460" y="160" width="130" height="65" fill="#111111" stroke="#F59E0B" strokeWidth={getStrokeWidth("groth16", 2)} rx="3" />
                    <text x="525" y="185" fill="#F59E0B" fontSize="11" fontWeight="bold" textAnchor="middle">Groth16</text>
                    <text x="525" y="200" fill="#666666" fontSize="8" textAnchor="middle">ZK-SNARK Engine</text>
                    <text x="525" y="212" fill="#444444" fontSize="8" textAnchor="middle">circom v2.2.3</text>
                </g>

                {/* ZK Verifier */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("zkverifier") }}
                    onMouseEnter={(e) => handleMouseEnter("zkverifier", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("zkverifier") ? "url(#glow-amber)" : undefined}
                >
                    <rect x="600" y="160" width="130" height="65" fill="#111111" stroke="#F59E0B" strokeWidth={getStrokeWidth("zkverifier", 2)} rx="3" />
                    <text x="665" y="185" fill="#F59E0B" fontSize="11" fontWeight="bold" textAnchor="middle">ZKVerifier</text>
                    <text x="665" y="200" fill="#666666" fontSize="8" textAnchor="middle">ZK Wrapper</text>
                    <text x="665" y="212" fill="#444444" fontSize="8" textAnchor="middle">32 constraints</text>
                </g>

                {/* Connections: Registry → Verification */}
                <g style={{ opacity: Math.max(getOpacity("registry"), getOpacity("attestor"), getOpacity("verifier")) }}>
                    <line x1="280" y1="130" x2="245" y2="155" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                    <line x1="350" y1="130" x2="385" y2="155" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                </g>

                {/* Groth16 ← ZKVerifier */}
                <g style={{ opacity: Math.max(getOpacity("groth16"), getOpacity("zkverifier")) }}>
                    <line x1="600" y1="192" x2="595" y2="192" stroke="#F59E0B" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                </g>

                {/* ═══════════════════════════════════════════════════════════════════
                    LAYER 3: APPLICATION — Hub with modules
                    ═══════════════════════════════════════════════════════════════════ */}

                {/* Hub container */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("hub") }}
                    onMouseEnter={(e) => handleMouseEnter("hub", e)}
                    onMouseLeave={handleMouseLeave}
                >
                    <rect x="180" y="255" width="600" height="130" fill="#111111" stroke="#FFFFFF" strokeWidth={getStrokeWidth("hub", 2)} rx="4" />
                    <text x="480" y="280" fill="#FFFFFF" fontSize="14" fontWeight="bold" textAnchor="middle">SkillProofHub</text>
                    <text x="480" y="295" fill="#666666" fontSize="9" textAnchor="middle">Skill-Gated DeFi • DAO Governance • Prediction Markets • Bounties</text>
                </g>

                {/* Hub modules */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("vault") }}
                    onMouseEnter={(e) => handleMouseEnter("vault", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("vault") ? "url(#glow-green)" : undefined}
                >
                    <rect x="200" y="310" width="90" height="55" fill="#0A0A0A" stroke="#00FF88" strokeWidth={getStrokeWidth("vault", 1.5)} rx="2" />
                    <text x="245" y="335" fill="#00FF88" fontSize="10" fontWeight="bold" textAnchor="middle">⚡ Vault</text>
                    <text x="245" y="350" fill="#666666" fontSize="7" textAnchor="middle">ELO-gated</text>
                </g>

                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("govern") }}
                    onMouseEnter={(e) => handleMouseEnter("govern", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("govern") ? "url(#glow-purple)" : undefined}
                >
                    <rect x="310" y="310" width="90" height="55" fill="#0A0A0A" stroke="#A855F7" strokeWidth={getStrokeWidth("govern", 1.5)} rx="2" />
                    <text x="355" y="335" fill="#A855F7" fontSize="10" fontWeight="bold" textAnchor="middle">🏛️ Govern</text>
                    <text x="355" y="350" fill="#666666" fontSize="7" textAnchor="middle">Weighted votes</text>
                </g>

                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("predict") }}
                    onMouseEnter={(e) => handleMouseEnter("predict", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("predict") ? "url(#glow-pink)" : undefined}
                >
                    <rect x="420" y="310" width="90" height="55" fill="#0A0A0A" stroke="#FF0080" strokeWidth={getStrokeWidth("predict", 1.5)} rx="2" />
                    <text x="465" y="335" fill="#FF0080" fontSize="10" fontWeight="bold" textAnchor="middle">🔮 Predict</text>
                    <text x="465" y="350" fill="#666666" fontSize="7" textAnchor="middle">Oracle markets</text>
                </g>

                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("arena") }}
                    onMouseEnter={(e) => handleMouseEnter("arena", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("arena") ? "url(#glow-cyan)" : undefined}
                >
                    <rect x="530" y="310" width="90" height="55" fill="#0A0A0A" stroke="#06B6D4" strokeWidth={getStrokeWidth("arena", 1.5)} rx="2" />
                    <text x="575" y="335" fill="#06B6D4" fontSize="10" fontWeight="bold" textAnchor="middle">⚔️ Arena</text>
                    <text x="575" y="350" fill="#666666" fontSize="7" textAnchor="middle">Skill bounties</text>
                </g>

                {/* Reputation flywheel label */}
                <text x="700" y="340" fill="#666666" fontSize="8" textAnchor="middle">+ Reputation</text>
                <text x="700" y="352" fill="#666666" fontSize="8" textAnchor="middle">Flywheel</text>

                {/* Connections: Verification → Hub */}
                <g style={{ opacity: Math.max(getOpacity("hub"), getOpacity("attestor"), getOpacity("verifier"), getOpacity("groth16"), getOpacity("zkverifier")) }}>
                    <line x1="245" y1="225" x2="245" y2="250" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                    <line x1="385" y1="225" x2="385" y2="250" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                    <line x1="525" y1="225" x2="525" y2="250" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                    <line x1="665" y1="225" x2="665" y2="250" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                </g>

                {/* ═══════════════════════════════════════════════════════════════════
                    LAYER 4: EXTENSIONS (3 contracts)
                    ═══════════════════════════════════════════════════════════════════ */}

                {/* Decay */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("decay") }}
                    onMouseEnter={(e) => handleMouseEnter("decay", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("decay") ? "url(#glow-purple)" : undefined}
                >
                    <rect x="200" y="415" width="140" height="55" fill="#111111" stroke="#A855F7" strokeWidth={getStrokeWidth("decay", 2)} rx="3" />
                    <text x="270" y="440" fill="#A855F7" fontSize="11" fontWeight="bold" textAnchor="middle">Decay</text>
                    <text x="270" y="455" fill="#666666" fontSize="8" textAnchor="middle">Temporal Freshness</text>
                </g>

                {/* Aggregator */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("aggregator") }}
                    onMouseEnter={(e) => handleMouseEnter("aggregator", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("aggregator") ? "url(#glow-cyan)" : undefined}
                >
                    <rect x="360" y="415" width="150" height="55" fill="#111111" stroke="#06B6D4" strokeWidth={getStrokeWidth("aggregator", 2)} rx="3" />
                    <text x="435" y="440" fill="#06B6D4" fontSize="11" fontWeight="bold" textAnchor="middle">Aggregator</text>
                    <text x="435" y="455" fill="#666666" fontSize="8" textAnchor="middle">Cross-Issuer Composite</text>
                </g>

                {/* Staking */}
                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("staking") }}
                    onMouseEnter={(e) => handleMouseEnter("staking", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("staking") ? "url(#glow-amber)" : undefined}
                >
                    <rect x="530" y="415" width="140" height="55" fill="#111111" stroke="#F59E0B" strokeWidth={getStrokeWidth("staking", 2)} rx="3" />
                    <text x="600" y="440" fill="#F59E0B" fontSize="11" fontWeight="bold" textAnchor="middle">Staking</text>
                    <text x="600" y="455" fill="#666666" fontSize="8" textAnchor="middle">Economic Security</text>
                </g>

                {/* Connections: Hub → Extensions */}
                <g style={{ opacity: Math.max(getOpacity("hub"), getOpacity("decay"), getOpacity("aggregator"), getOpacity("staking")) }}>
                    <line x1="270" y1="385" x2="270" y2="410" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                    <line x1="435" y1="385" x2="435" y2="410" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                    <line x1="600" y1="385" x2="600" y2="410" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" markerEnd="url(#arrow-gray)" />
                </g>

                {/* ═══════════════════════════════════════════════════════════════════
                    LAYER 5: INFRASTRUCTURE — FTSO Oracle
                    ═══════════════════════════════════════════════════════════════════ */}

                <g
                    className="contract-box"
                    style={{ opacity: getOpacity("oracle") }}
                    onMouseEnter={(e) => handleMouseEnter("oracle", e)}
                    onMouseLeave={handleMouseLeave}
                    filter={isHighlighted("oracle") ? "url(#glow-green)" : undefined}
                >
                    <rect x="250" y="500" width="400" height="55" fill="#111111" stroke="#00FF88" strokeWidth={getStrokeWidth("oracle", 2)} strokeDasharray="6,3" rx="4" />
                    <text x="450" y="525" fill="#00FF88" fontSize="12" fontWeight="bold" textAnchor="middle">Flare FTSOv2 Oracle</text>
                    <text x="450" y="542" fill="#666666" fontSize="9" textAnchor="middle">FLR/USD • BTC/USD • ETH/USD • Block-Latency Feeds</text>
                </g>

                {/* Connections to Oracle */}
                <g style={{ opacity: Math.max(getOpacity("attestor"), getOpacity("oracle")) }}>
                    <line x1="245" y1="225" x2="180" y2="250" stroke="#FF0080" strokeWidth="1" />
                    <line x1="180" y1="250" x2="180" y2="527" stroke="#FF0080" strokeWidth="1" />
                    <line x1="180" y1="527" x2="245" y2="527" stroke="#FF0080" strokeWidth="1" markerEnd="url(#arrow-pink)" />
                </g>

                <g style={{ opacity: Math.max(getOpacity("predict"), getOpacity("oracle")) }}>
                    <line x1="465" y1="365" x2="450" y2="365" stroke="#FF0080" strokeWidth="1" />
                    <line x1="450" y1="365" x2="450" y2="495" stroke="#FF0080" strokeWidth="1" markerEnd="url(#arrow-pink)" />
                </g>

                {/* Legend */}
                <g transform="translate(750, 420)">
                    <text x="0" y="0" fill="#666666" fontSize="8" fontWeight="bold">LEGEND</text>
                    <line x1="0" y1="15" x2="30" y2="15" stroke="#00FF88" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
                    <text x="35" y="18" fill="#666666" fontSize="7">Credential flow</text>
                    <line x1="0" y1="30" x2="30" y2="30" stroke="#FF0080" strokeWidth="1" />
                    <text x="35" y="33" fill="#666666" fontSize="7">Oracle data</text>
                    <line x1="0" y1="45" x2="30" y2="45" stroke="#666666" strokeWidth="1" strokeDasharray="3,3" />
                    <text x="35" y="48" fill="#666666" fontSize="7">Reads</text>
                </g>

                {/* Layer labels on right side */}
                <text x="820" y="90" fill="#333333" fontSize="8" textAnchor="middle">IDENTITY</text>
                <text x="820" y="192" fill="#333333" fontSize="8" textAnchor="middle">VERIFICATION</text>
                <text x="820" y="320" fill="#333333" fontSize="8" textAnchor="middle">APPLICATION</text>
                <text x="820" y="442" fill="#333333" fontSize="8" textAnchor="middle">EXTENSIONS</text>
                <text x="820" y="527" fill="#333333" fontSize="8" textAnchor="middle">INFRASTRUCTURE</text>
            </svg>
        </div>
    );
}

import Link from "next/link";
import ArchitectureDiagram from "@/components/ArchitectureDiagram";

const steps = [
  {
    num: "01",
    title: "Issuer Mints Credential",
    desc: "Score is committed on-chain via hash — never revealed publicly. Only the proof matters.",
    color: "text-accent",
  },
  {
    num: "02",
    title: "User Generates ZK Proof",
    desc: '"My score ≥ 80" — proven without exposing the actual score. Groth16 SNARKs keep data private.',
    color: "text-pink",
  },
  {
    num: "03",
    title: "Verifier Checks On-Chain",
    desc: "Proof validity + credential status + Flare oracle attestation. Trustless, timestamped, verifiable.",
    color: "text-amber-500",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-12 animate-fade-in">
      {/* Hero */}
      <section className="pt-24 pb-20">
        <p className="text-xs uppercase tracking-widest text-pink mb-4 font-body">
          Built on Flare Network
        </p>
        <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-6 tracking-[0.1em]">
          <span className="text-white">SKILLPROOF</span>
          <br />
          <span className="text-accent">PROTOCOL</span>
        </h1>
        <p className="text-muted text-sm max-w-lg mb-10 leading-relaxed font-body">
          Soulbound credential protocol with ZK-SNARK proofs,
          temporal decay, and cross-issuer aggregation. 9 smart contracts on
          Flare Coston2 — Groth16 threshold proofs, Merkle verification,
          skill-gated DeFi, and oracle-resolved prediction markets.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link href="/issuer" className="btn-primary">
            Go to Issuer
          </Link>
          <Link href="/user" className="btn-secondary">
            Go to User
          </Link>
          <Link href="/verify" className="btn-pink">
            Go to Verify
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 border-t border-[#1a1a1a]">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#555] mb-10">
          How It Works
        </h2>
        <div className="grid gap-6 md:grid-cols-3 stagger-animate">
          {steps.map((s, idx) => (
            <div
              key={s.num}
              className={`card hover-lift ${s.color === 'text-accent' ? 'hover-glow-green' : s.color === 'text-pink' ? 'hover-glow-pink' : 'hover-glow-amber'}`}
            >
              <span className={`text-4xl font-bold ${s.color} animate-bounce-subtle`}>{s.num}</span>
              <h3 className="text-white font-bold mt-3 mb-2 text-sm uppercase tracking-wide">
                {s.title}
              </h3>
              <p className="text-muted text-xs leading-relaxed font-body">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="py-16 border-t border-[#1a1a1a]">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#555] mb-10">
          Architecture
        </h2>
        <ArchitectureDiagram />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 stagger-animate">
          <div className="card text-center hover-scale hover-glow-green cursor-default">
            <div className="stat-number-green">9</div>
            <span className="text-[10px] text-[#555] uppercase tracking-[0.1em] block mt-2">Smart Contracts</span>
          </div>
          <div className="card text-center hover-scale hover-glow-amber cursor-default">
            <div className="stat-number-amber">4</div>
            <span className="text-[10px] text-[#555] uppercase tracking-[0.1em] block mt-2">Crypto Layers</span>
          </div>
          <div className="card text-center hover-scale hover-glow-green cursor-default">
            <div className="stat-number-green">182+</div>
            <span className="text-[10px] text-[#555] uppercase tracking-[0.1em] block mt-2">Tests Passing</span>
          </div>
          <div className="card text-center hover-scale hover-glow-pink cursor-default">
            <div className="stat-number-pink">3</div>
            <span className="text-[10px] text-[#555] uppercase tracking-[0.1em] block mt-2">FTSO Feeds</span>
          </div>
        </div>

        <div className="mt-4 text-xs text-muted leading-relaxed space-y-1 font-body">
          <p>4 cryptographic layers: commit-reveal, Merkle proofs, threshold proofs, ZK-SNARKs (Groth16)</p>
          <p>Temporal credential decay — credentials lose value if not refreshed, incentivizing freshness</p>
          <p>Cross-issuer skill aggregation — composite scores across multiple credential issuers</p>
        </div>
      </section>

      {/* Contract info */}
      <section className="py-16 border-t border-[#1a1a1a]">
        <h2 className="text-[11px] uppercase tracking-[0.12em] text-[#555] mb-6">
          9 Smart Contracts — Live on Coston2
        </h2>
        <div className="space-y-2">
          {[
            { label: "Registry", addr: "0xa855e8E15C9F350438065D19a73565ea1A23E33A", color: "border-accent" },
            { label: "Attestor", addr: "0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4", color: "border-amber-500" },
            { label: "Hub", addr: "0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3", color: "border-[#888]" },
            { label: "Verifier", addr: "0xBEFded5454c7b3E16f1Db888e8280793735B866b", color: "border-amber-500" },
            { label: "Groth16", addr: "0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664", color: "border-amber-500" },
            { label: "ZKVerifier", addr: "0x0F46334167e68C489DE6B65D488F9d64624Bc270", color: "border-amber-500" },
            { label: "Decay", addr: "0x20d0A539e0A49991876CDb2004FeA41AFE1C089E", color: "border-purple-500" },
            { label: "Aggregator", addr: "0x919473044Dde9b3eb69161C4a35eFfb995a234bB", color: "border-cyan-500" },
          ].map((c) => (
            <div key={c.label} className={`flex items-center gap-3 border-l-2 ${c.color} pl-4 py-2 bg-[#111] hover:bg-[#161616] transition-colors`}>
              <span className="text-[11px] text-[#666] w-24 uppercase tracking-wide">{c.label}</span>
              <a
                href={`https://coston2-explorer.flare.network/address/${c.addr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-[#888] hover:text-accent transition-colors font-mono"
              >
                {c.addr}
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

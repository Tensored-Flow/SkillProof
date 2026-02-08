import Link from "next/link";

const steps = [
  {
    num: "01",
    title: "Issuer Mints Credential",
    desc: "Score is committed on-chain via hash — never revealed publicly. Only the proof matters.",
  },
  {
    num: "02",
    title: "User Generates ZK Proof",
    desc: '"My score ≥ 80" — proven without exposing the actual score. Groth16 SNARKs keep data private.',
  },
  {
    num: "03",
    title: "Verifier Checks On-Chain",
    desc: "Proof validity + credential status + Flare oracle attestation. Trustless, timestamped, verifiable.",
  },
];

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <section className="py-16">
        <p className="text-xs uppercase tracking-widest text-pink mb-4">
          Built on Flare Network
        </p>
        <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-6">
          Prove skills
          <br />
          <span className="text-accent">without exposing</span>
          <br />
          your data.
        </h1>
        <p className="text-muted text-sm max-w-lg mb-10 leading-relaxed">
          SkillProof is a soulbound credential registry with zero-knowledge
          proofs. Issuers mint verifiable credentials, users prove claims
          without revealing scores, and verifiers check everything on-chain —
          anchored by Flare&apos;s FTSO oracle.
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
      <section className="py-12 border-t-2 border-border">
        <h2 className="text-xs uppercase tracking-widest text-muted mb-8">
          How It Works
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.num} className="card">
              <span className="text-accent text-3xl font-bold">{s.num}</span>
              <h3 className="text-white font-bold mt-3 mb-2 text-sm uppercase tracking-wide">
                {s.title}
              </h3>
              <p className="text-muted text-xs leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="py-12 border-t-2 border-border">
        <h2 className="text-xs uppercase tracking-widest text-muted mb-8">
          Architecture
        </h2>
        <div className="card">
          <pre className="text-xs text-accent leading-relaxed">
{`  FinCraft Arena          SkillProof Protocol             Verifier
  ┌──────────┐     ┌─────────────────────────┐     ┌──────────┐
  │  Game     │────▶│  SkillProofRegistry     │     │  Checks: │
  │  Engine   │     │  (soulbound creds)      │◀────│  - Cred   │
  │           │     ├─────────────────────────┤     │  - Proof  │
  │  Score:96 │     │  SkillProofAttestor     │     │  - Oracle │
  │  ELO:1847 │     │  (FTSO oracle anchor)   │     │           │
  └──────────┘     └────────┬────────────────┘     └──────────┘
                            │
                   ┌────────▼────────────────┐
                   │  Flare FTSOv2 Oracle    │
                   │  FLR/USD live price     │
                   │  Block-latency feeds    │
                   └─────────────────────────┘`}
          </pre>
        </div>
      </section>

      {/* Contract info */}
      <section className="py-12 border-t-2 border-border">
        <h2 className="text-xs uppercase tracking-widest text-muted mb-4">
          Live on Coston2
        </h2>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex gap-2">
            <span className="text-muted w-24">Registry:</span>
            <a
              href="https://coston2-explorer.flare.network/address/0xa855e8E15C9F350438065D19a73565ea1A23E33A"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline break-all"
            >
              0xa855e8E15C9F350438065D19a73565ea1A23E33A
            </a>
          </div>
          <div className="flex gap-2">
            <span className="text-muted w-24">Attestor:</span>
            <a
              href="https://coston2-explorer.flare.network/address/0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline break-all"
            >
              0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

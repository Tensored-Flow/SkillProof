# SkillProof Protocol

Verifiable on-chain skill credentials with ZK-SNARK proofs, temporal decay, economic security via issuer staking/slashing, cross-issuer aggregation, skill-gated DeFi, governance, prediction markets, and bounties. Built on Flare Network (Coston2 testnet) with multi-feed FTSO oracle integration.

**13 smart contracts · 284 tests · 5 cryptographic layers · 6 frontend pages · 3 FTSO price feeds · SDK**

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js · 6 pages)                    │
│   Dashboard · Issuer · User · Hub · Verify · Leaderboard            │
└──────┬──────────┬──────────────┬───────────────┬────────────────────┘
       │          │              │               │
       │    ┌─────▼──────┐      │               │
       │    │  SDK        │     │               │
       │    │  (sdk/)     │     │               │
       │    └─────┬──────┘      │               │
       │          │              │               │
┌──────▼──────┐ ┌─▼──────────┐ ┌▼───────────┐ ┌▼──────────────┐
│  Registry   │ │  Attestor  │ │    Hub     │ │   Verifier    │
│  Soulbound  │ │  FTSO      │ │ Vault│Gov│ │ │ Merkle Proofs │
│  Credentials│ │  Oracle    │ │ Predict│Ar│ │ Threshold ZK  │
└──────┬──────┘ └──┬─────────┘ └┬───────────┘ └─┬─────────────┘
       │           │            │                │
┌──────▼──────┐    │     ┌──────▼──────┐  ┌──────▼──────┐
│   Staking   │    │     │ Aggregator  │  │  Groth16    │
│   Economic  │    │     │ Multi-Issuer│  │  ZK-SNARK   │
│   Security  │    │     │ Composer    │  │  Verifier   │
└─────────────┘    │     └─────────────┘  └─────────────┘
                   │
┌──────────────┐   │
│    Decay     │   │
│   Temporal   │   │
│   Freshness  │   │
└──────────────┘   │
                   │
       ┌───────────▼──────────────┐
       │   Flare Coston2 Testnet  │
       │  FTSOv2: FLR/USD BTC/USD │
       │          ETH/USD          │
       └──────────────────────────┘
```

## Contracts

**SkillProofRegistry** — The credential primitive. Issuers mint ELO-rated skill credentials for players. Every gated operation in the protocol reads from this contract.

**SkillProofAttestor** — Anchors credentials to Flare FTSO oracle state, creating a verifiable timestamp proof that a credential existed at a known price feed moment.

**SkillProofHub** — Four composable modules that gate access using Registry credentials:

| Module | Description |
|--------|-------------|
| **Vault** | Skill-gated DeFi — anyone deposits C2FLR, only players with ELO >= threshold can withdraw |
| **Govern** | Skill-weighted DAO — vote weight equals your credential percentile (96th percentile = 96 weight) |
| **Predict** | Expert prediction markets with commit-reveal + Flare FTSO oracle resolution (FLR/USD, BTC/USD, ETH/USD) |
| **Arena** | Anonymous skill bounties with commit-reveal solutions and C2FLR rewards |

**SkillProofVerifier** — Privacy-preserving credential verification via Merkle proofs:

| Feature | Description |
|---------|-------------|
| **Credential Proofs** | Prove a credential exists in the Merkle tree without revealing all data on-chain |
| **Threshold Proofs** | Prove "my ELO >= X" without revealing exact ELO — privacy-preserving skill gates |
| **Replay Prevention** | Each proof can only be recorded once via `usedProofs` mapping |
| **On-chain Tree Build** | Operator builds Merkle root directly from Registry state — no off-chain trust |

**Groth16Verifier** — Auto-generated Solidity verifier for the circom2 ZK-SNARK circuit. Verifies Groth16 proofs on-chain in a single transaction.

**SkillProofZKVerifier** — Wraps the Groth16Verifier to verify threshold proofs ("my ELO >= X") using zero-knowledge SNARKs. The circom2 circuit uses a commitment scheme (ELO + salt * 2^32) — the prover demonstrates knowledge of a valid ELO without revealing it.

**SkillProofDecay** — Time-weighted credential freshness. Credentials lose 1% value per day if not refreshed by the issuer, flooring at 50%. Incentivizes issuers to keep credentials current.

**SkillProofAggregator** — Multi-issuer credential composer. Links multiple credential addresses to one primary identity, computes weighted-average ELO across issuers, and awards a cross-domain bonus (+50 per additional issuer).

**SkillProofStaking** — Economic security layer. Issuers stake native tokens to register, creating skin-in-the-game. Fraudulent issuers get slashed (50% penalty). Features 7-day lock period, increaseStake for recovery, and permanent slash count record.

**SkillProofTreasury** — Protocol fee collection and revenue analytics. Collects minting, market creation, and verification fees with per-issuer revenue tracking, bounty commissions, and periodic snapshots.

**SkillProofEngine** — On-chain ELO rating engine with fixed-point math. Records matches, computes ELO changes with dynamic K-factors (32/24/16), tracks win streaks, peak ratings, and domain-specific ELOs.

**MatchHistoryGroth16Verifier** — Auto-generated Solidity verifier for the match history circom2 ZK-SNARK circuit (176 constraints). Verifies Groth16 proofs of match history properties on-chain.

**SkillProofMatchVerifier** — ZK match history verification wrapper. Proves "I played >= X matches AND my win rate >= Y%" without revealing exact record, opponents, or match details. Uses an algebraic ratio proof technique (wins * 10000 >= minWinRateBps * totalMatches) to verify percentages in zero knowledge without division.

## Deployed Contracts (Coston2)

| Contract | Address |
|----------|---------|
| SkillProofRegistry | `0xa855e8E15C9F350438065D19a73565ea1A23E33A` |
| SkillProofAttestor | `0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4` |
| SkillProofHub | `0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3` |
| SkillProofVerifier | `0xBEFded5454c7b3E16f1Db888e8280793735B866b` |
| Groth16Verifier | `0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664` |
| SkillProofZKVerifier | `0x0F46334167e68C489DE6B65D488F9d64624Bc270` |
| SkillProofDecay | `0x20d0A539e0A49991876CDb2004FeA41AFE1C089E` |
| SkillProofAggregator | `0x919473044Dde9b3eb69161C4a35eFfb995a234bB` |
| SkillProofStaking | `0xc9c6837759c769CCA40661285e5633727A1EbDDD` |
| SkillProofTreasury | `0xAd9BBc0294C8710FB96eA1d88b0D760C41074E01` |
| SkillProofEngine | `0x936df2cfC13ed7970B5c028a3940e9aB45497376` |
| MatchHistoryGroth16Verifier | `0x66904E1933F7d5f57Dc537C6e2F9d585e33bc8A6` |
| SkillProofMatchVerifier | `0x417dbD1E6D4A35bb09bcC1E1b8DE64F8a2fC70a2` |

## SDK

The `sdk/` directory provides a developer-friendly TypeScript SDK for integrating SkillProof into any protocol.

```typescript
import { SkillProof } from "@skillproof/sdk";

const sdk = new SkillProof("https://coston2-api.flare.network/ext/C/rpc");

// Skill-gate any operation in 3 lines
const result = await sdk.checkGate(userAddress, {
  minElo: 1500,
  useDecayedElo: true,
});

if (result.passed) {
  // Grant access to your protocol
} else {
  console.log(result.reason); // "ELO 923 below minimum 1500"
}
```

See [sdk/README.md](sdk/README.md) for full API reference, use cases (skill-gated DeFi, weighted governance, ZK verification queries), and runnable examples.

## Tests

**284 passing, 1 pending** (the pending test requires a live Flare Coston2 FTSO oracle)

| Test File | Count |
|-----------|-------|
| SkillProofAggregator.test.ts | 16 |
| SkillProofDecay.test.ts | 26 |
| SkillProofEngine.test.ts | 32 |
| SkillProofHub.test.ts | 56 passing, 1 pending |
| SkillProofMatchVerifier.test.ts | 19 |
| SkillProofRegistry.test.ts | 30 |
| SkillProofStaking.test.ts | 28 |
| SkillProofTreasury.test.ts | 23 |
| SkillProofVerifier.test.ts | 36 |
| SkillProofZKVerifier.test.ts | 18 |

## Project Structure

```
contracts/
  SkillProofRegistry.sol   — Credential registry (ELO, percentiles, skill domains)
  SkillProofAttestor.sol   — FTSO oracle attestation layer
  SkillProofHub.sol        — Hub: Vault + Govern + Predict + Arena modules
  SkillProofVerifier.sol   — Merkle proof verification + threshold proofs
  Groth16Verifier.sol      — Auto-generated Groth16 SNARK verifier
  SkillProofZKVerifier.sol — ZK-SNARK threshold proof wrapper
  SkillProofDecay.sol      — Time-weighted credential decay
  SkillProofAggregator.sol — Multi-issuer credential aggregation
  SkillProofStaking.sol    — Issuer staking + slashing economic security
  SkillProofTreasury.sol   — Protocol fee collection + revenue analytics
  SkillProofEngine.sol     — On-chain ELO rating engine with K-factors
  MatchHistoryVerifier.sol — Auto-generated Groth16 verifier (match history circuit)
  SkillProofMatchVerifier.sol — ZK match history proof wrapper
circuits/
  threshold_proof.circom   — circom2 circuit: proves ELO >= threshold (36 constraints)
  match_history_proof.circom — circom2 circuit: proves match count + win rate (176 constraints)
  build/                   — Compiled WASM, zkey, verification keys
sdk/
  index.ts                 — SDK entry point (SkillProof class)
  README.md                — SDK documentation + API reference
  examples/
    gate-example.ts        — Runnable demo against live Coston2 contracts
scripts/
  deploy.ts                — Deploy Registry
  deploy-attestor.ts       — Deploy Attestor
  deploy-hub.ts            — Deploy Hub
  deploy-verifier.ts       — Deploy Verifier + set Merkle root from Registry
  deploy-zk-verifier.ts    — Deploy Groth16Verifier + ZKVerifier
  deploy-decay.ts          — Deploy Decay
  deploy-aggregator.ts     — Deploy Aggregator
  deploy-staking.ts        — Deploy Staking + auto-stake issuers
  deploy-treasury.ts       — Deploy Treasury
  deploy-engine.ts         — Deploy Engine
  deploy-match-verifier.ts — Deploy MatchHistoryGroth16Verifier + MatchVerifier
  generate-zk-proof.ts     — Generate Groth16 threshold proofs
  generate-match-proof.ts  — Generate Groth16 match history proofs
  seed.ts                  — Seed credentials
  seed-hub.ts              — Seed all 4 Hub modules with demo data
  seed-multi-feed.ts       — Seed BTC/USD + ETH/USD prediction markets
  seed-multi-issuer.ts     — Seed multi-issuer credentials for aggregation
  attest.ts                — Run FTSO attestations
test/                      — 284 tests (10 test files)
lib/
  deployments.json         — Contract addresses per network
  abi.json                 — Registry ABI
  attestor-abi.json        — Attestor ABI
  hub-abi.json             — Hub ABI
  verifier-abi.json        — Verifier ABI
  zk-verifier-abi.json     — Groth16Verifier ABI
  zk-wrapper-abi.json      — ZKVerifier wrapper ABI
  decay-abi.json           — Decay ABI
  aggregator-abi.json      — Aggregator ABI
  staking-abi.json         — Staking ABI
  treasury-abi.json        — Treasury ABI
  engine-abi.json          — Engine ABI
  match-history-verifier-abi.json — MatchHistoryGroth16Verifier ABI
  match-verifier-abi.json  — MatchVerifier wrapper ABI
frontend/                  — Next.js frontend (6 pages)
```

## Setup

```bash
npm install
cp .env.example .env  # add your PRIVATE_KEY
npx hardhat compile
npx hardhat test
```

## Deploy

```bash
# 1. Registry
npx hardhat run scripts/deploy.ts --network coston2
npx hardhat run scripts/seed.ts --network coston2

# 2. Attestor
npx hardhat run scripts/deploy-attestor.ts --network coston2
npx hardhat run scripts/attest.ts --network coston2

# 3. Hub
npx hardhat run scripts/deploy-hub.ts --network coston2
npx hardhat run scripts/seed-hub.ts --network coston2

# 4. Verifier
npx hardhat run scripts/deploy-verifier.ts --network coston2

# 5. ZK-SNARK Verifier
npx hardhat run scripts/deploy-zk-verifier.ts --network coston2

# 6. Decay
npx hardhat run scripts/deploy-decay.ts --network coston2

# 7. Aggregator
npx hardhat run scripts/deploy-aggregator.ts --network coston2
npx hardhat run scripts/seed-multi-issuer.ts --network coston2

# 8. Staking
npx hardhat run scripts/deploy-staking.ts --network coston2

# 9. Treasury
npx hardhat run scripts/deploy-treasury.ts --network coston2

# 10. Engine
npx hardhat run scripts/deploy-engine.ts --network coston2

# 11. Match History ZK Verifier
npx hardhat run scripts/deploy-match-verifier.ts --network coston2

# Generate ZK proofs for demo
npx hardhat run scripts/generate-zk-proof.ts
SUBMIT=true npx hardhat run scripts/generate-zk-proof.ts --network coston2

# Generate match history ZK proofs
npx hardhat run scripts/generate-match-proof.ts
TOTAL_MATCHES=12 WINS=8 MIN_MATCHES=10 MIN_WIN_RATE=6000 SALT=54321 SUBMIT=true \
  npx hardhat run scripts/generate-match-proof.ts --network coston2
```

## Track Justification

### Programmable Cryptography

SkillProof implements 5 cryptographic layers for privacy-preserving skill verification:

1. **Commit-reveal schemes** — Prediction markets and bounty solutions use commit-reveal to prevent front-running and ensure fairness
2. **Merkle proof verification** — Credential inclusion proofs allow users to prove they hold a valid credential without exposing all credential fields on-chain
3. **Threshold proofs** — Privacy-preserving ELO gates: prove "my ELO >= 1500" without revealing the exact score via threshold Merkle trees
4. **ZK-SNARKs (Groth16)** — A real circom2 circuit proves "my ELO >= threshold" without revealing the ELO. Uses commitment scheme (ELO + salt * 2^32), verified on-chain via auto-generated Groth16 Solidity verifier
5. **Oracle-anchored attestations** — Credentials are timestamped against Flare FTSO price feed state, creating a cryptographic proof that a credential existed at a specific oracle moment

Additional cryptographic primitives:
- **Replay prevention** — Proof hashes tracked on-chain to prevent double-use
- **Temporal decay** — Time-weighted credential freshness with configurable decay rate and floor
- **Cross-issuer aggregation** — Composite scores across multiple credential issuers with cross-domain bonus
- **Economic security** — Staking/slashing mechanism with game-theoretic incentives for honest issuer behavior

### Flare Network

Three distinct FTSO price feeds are used across two contracts:

| Feed | Contract | Usage |
|------|----------|-------|
| FLR/USD | SkillProofAttestor | Anchor credential attestations to FLR price state |
| FLR/USD | SkillProofHub (Predict) | Prediction market: "Will FLR exceed $1.00?" |
| BTC/USD | SkillProofHub (Predict) | Prediction market: "Will BTC exceed $100,000?" |
| ETH/USD | SkillProofHub (Predict) | Prediction market: "Will ETH exceed $4,000?" |

All feeds use Flare FTSOv2 block-latency price oracles via `IFtsoV2` interface at the canonical Coston2 address.

## Tech Stack

- **Solidity ^0.8.25** — 13 contracts compiled with `viaIR: true` + optimizer
- **Hardhat 2.22** — Build, test, deploy
- **circom2 + snarkjs** — ZK-SNARK circuit compilation and proof generation (Groth16)
- **Flare FTSO v2** — On-chain price oracle (3 feeds: FLR/USD, BTC/USD, ETH/USD)
- **Flare Coston2** — Testnet (chain ID 114)
- **Next.js** — Frontend with dual-mode (demo / live contract)
- **ethers.js v6** — Contract interaction
- **TypeScript SDK** — Developer integration library

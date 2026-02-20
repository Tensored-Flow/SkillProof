# SkillProof Protocol

**Verifiable skill credentials for the internet — programmable competence gating, powered by Flare.**

[![Contracts](https://img.shields.io/badge/contracts-13%20deployed-00FF88)]() [![Tests](https://img.shields.io/badge/tests-284%20passing-00FF88)]() [![ZK Circuits](https://img.shields.io/badge/ZK%20circuits-2%20Groth16-A855F7)]() [![Crypto Primitives](https://img.shields.io/badge/crypto%20primitives-5-FF0080)]() [![Network](https://img.shields.io/badge/Flare-Coston2-F59E0B)]()

[Live Frontend](https://tensored-flow.github.io/SkillProof) · [Coston2 Explorer](https://coston2-explorer.flare.network) · [GitHub](https://github.com/Tensored-Flow/SkillProof)

---

## The Problem

Web3 has **$237B+ in TVL** with **zero competence gating**. Anyone can access any protocol regardless of skill — a first-day trader gets the same DeFi access as a 10-year veteran. The consequences are real:

- **Cascading liquidations** from inexperienced users entering complex positions they don't understand
- **Governance capture** where token-weighted voting lets whales override domain experts
- **Sybil-vulnerable bounty systems** where anonymous submissions have no quality signal
- **No portable skill reputation** — your track record on one platform is invisible to every other

Skill verification today is siloed, self-reported, and non-portable. There is no on-chain primitive for competence.

## The Solution

SkillProof is an **on-chain protocol for issuing, verifying, and composing skill credentials**. Credentials are soulbound, oracle-attested, and ZK-verifiable. Any platform can issue credentials, any protocol can gate by skill.

Four application modules demonstrate real use cases:

| Module | What It Does |
|--------|-------------|
| **Vault** | Skill-gated DeFi — deposit freely, withdraw requires ELO >= 1500 |
| **Govern** | Skill-weighted DAO — vote weight = skill percentile, not token holdings |
| **Predict** | Commit-reveal prediction markets resolved by Flare FTSO oracles |
| **Arena** | Anonymous bounties with commit-reveal solutions, credential-gated participation |

The result: a **reputation flywheel** where protocol participation (winning predictions, completing bounties) feeds back into your on-chain skill score, which unlocks more protocol access.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js · 6 pages)                    │
│   Home · Issuer · User · Hub · Verify · Leaderboard                  │
└──────┬──────────┬──────────────┬───────────────┬────────────────────┘
       │          │              │               │
       │    ┌─────▼──────┐      │               │
       │    │  SDK        │     │               │
       │    │  (14 methods)│    │               │
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
┌──────────────┐   │     ┌──────────────┐  ┌──────────────┐
│    Decay     │   │     │ Match ZK     │  │  Match ZK    │
│   Temporal   │   │     │ Groth16      │  │  Verifier    │
│   Freshness  │   │     │ Verifier     │  │  Wrapper     │
└──────────────┘   │     └──────────────┘  └──────────────┘
                   │
       ┌───────────▼──────────────┐
       │   Flare Coston2 Testnet  │
       │  FTSOv2: FLR/USD BTC/USD │
       │          ETH/USD          │
       └──────────────────────────┘
```

### Deployed Contracts (Coston2)

| Contract | Address | Role |
|----------|---------|------|
| SkillProofRegistry | [`0xa855e8E15C9F350438065D19a73565ea1A23E33A`](https://coston2-explorer.flare.network/address/0xa855e8E15C9F350438065D19a73565ea1A23E33A) | Soulbound credential storage |
| SkillProofAttestor | [`0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4`](https://coston2-explorer.flare.network/address/0xCf7C40Cf2734623db2AeC70dabD060E83b45bef4) | FTSO oracle attestation |
| SkillProofHub | [`0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3`](https://coston2-explorer.flare.network/address/0x3eBaD0A13fDe9808938a4eD4f2fE5d92c8b29Cc3) | Vault + Govern + Predict + Arena |
| SkillProofVerifier | [`0xBEFded5454c7b3E16f1Db888e8280793735B866b`](https://coston2-explorer.flare.network/address/0xBEFded5454c7b3E16f1Db888e8280793735B866b) | Merkle proof verification |
| Groth16Verifier | [`0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664`](https://coston2-explorer.flare.network/address/0xe5Ddc3EfFb0Aa08Eb3e5091128f12D7aB9E0A664) | ZK-SNARK on-chain verifier |
| SkillProofZKVerifier | [`0x0F46334167e68C489DE6B65D488F9d64624Bc270`](https://coston2-explorer.flare.network/address/0x0F46334167e68C489DE6B65D488F9d64624Bc270) | ZK threshold proof wrapper |
| SkillProofDecay | [`0x20d0A539e0A49991876CDb2004FeA41AFE1C089E`](https://coston2-explorer.flare.network/address/0x20d0A539e0A49991876CDb2004FeA41AFE1C089E) | Temporal credential freshness |
| SkillProofAggregator | [`0x919473044Dde9b3eb69161C4a35eFfb995a234bB`](https://coston2-explorer.flare.network/address/0x919473044Dde9b3eb69161C4a35eFfb995a234bB) | Multi-issuer credential composer |
| SkillProofStaking | [`0xc9c6837759c769CCA40661285e5633727A1EbDDD`](https://coston2-explorer.flare.network/address/0xc9c6837759c769CCA40661285e5633727A1EbDDD) | Issuer staking + slashing |
| SkillProofTreasury | [`0xAd9BBc0294C8710FB96eA1d88b0D760C41074E01`](https://coston2-explorer.flare.network/address/0xAd9BBc0294C8710FB96eA1d88b0D760C41074E01) | Protocol fee collection |
| SkillProofEngine | [`0x936df2cfC13ed7970B5c028a3940e9aB45497376`](https://coston2-explorer.flare.network/address/0x936df2cfC13ed7970B5c028a3940e9aB45497376) | On-chain ELO rating engine |
| MatchHistoryGroth16Verifier | [`0x66904E1933F7d5f57Dc537C6e2F9d585e33bc8A6`](https://coston2-explorer.flare.network/address/0x66904E1933F7d5f57Dc537C6e2F9d585e33bc8A6) | Match history ZK verifier |
| SkillProofMatchVerifier | [`0x417dbD1E6D4A35bb09bcC1E1b8DE64F8a2fC70a2`](https://coston2-explorer.flare.network/address/0x417dbD1E6D4A35bb09bcC1E1b8DE64F8a2fC70a2) | Match history proof wrapper |

---

## Cryptographic Primitives

SkillProof implements **5 distinct cryptographic layers** that compose into a full privacy-preserving skill verification stack.

### 1. ZK-SNARK Threshold Proofs (Groth16)

**Circuit:** `circuits/threshold_proof.circom` — **36 constraints**

Proves "my ELO >= threshold" without revealing the exact ELO. The circuit uses:

- **Bit-decomposition range check**: 32-bit decomposition of `(elo - threshold)` with constraint `bits[i] * (1 - bits[i]) === 0` per bit, ensuring the difference is non-negative
- **Commitment scheme**: `commitment = elo + salt * 2^32` — the salt blinds the ELO value so the commitment reveals nothing about the underlying score
- **Public signals**: `[valid, threshold, credentialCommitment]` — the verifier sees only the threshold claimed and the commitment, never the ELO

The full trusted setup ceremony was performed: powers of tau (pot12) + circuit-specific phase 2 contribution. The on-chain Groth16 verifier was auto-generated by `snarkjs zkey export solidityverifier`.

```
User: "I have ELO >= 1500"
Circuit: Checks (elo - 1500) is non-negative via bit decomposition
         Verifies commitment = elo + salt * 2^32
Output:  [1, 1500, commitment] — valid proof, no ELO leaked
```

### 2. ZK-SNARK Match History Proofs (Groth16)

**Circuit:** `circuits/match_history_proof.circom` — **176 constraints** (~5x more complex)

Proves "I played >= X matches AND my win rate >= Y%" without revealing match count, wins, losses, or opponents.

- **Ratio proof without division**: `wins * 10000 >= minWinRateBps * totalMatches` — avoids field division entirely by comparing cross-multiplied products
- **Commitment**: `totalMatches + wins * 2^16 + salt * 2^32`
- **Public signals**: `[minMatches, minWinRateBps, commitment]`
- **Separate trusted setup ceremony** (reuses pot12, fits within 4096 constraint limit)

This circuit enables privacy-preserving competitive matchmaking — a player can prove they're experienced with a strong win rate without revealing their exact record or who they played.

### 3. Commit-Reveal Schemes

Used across two Hub modules to prevent front-running and ensure fairness:

- **Prediction Markets**: Users commit `keccak256(prediction || salt)` during the commit phase, then reveal `(prediction, salt)` after the deadline. The contract verifies the hash matches. Nobody can copy your prediction before the deadline.
- **Bounty Solutions**: Same pattern — commit a solution hash, reveal after evaluation period. Prevents solution plagiarism and enables anonymous skill assessment.

Both provide **computational hiding** (can't determine the value from the hash) and **computational binding** (can't change your committed value after the fact).

### 4. Merkle Proof Verification

The Verifier contract builds a Merkle tree from Registry credential data and supports two proof types:

- **Credential inclusion proofs**: Prove a credential exists in the tree without revealing all credential fields on-chain
- **Threshold proofs**: Prove "my ELO >= X" using a Merkle tree built with threshold flags — the tree encodes boolean `meetsThreshold` per user, and the proof reveals only that flag
- **Replay prevention**: Each proof hash is tracked on-chain via `usedProofs` mapping to prevent double-use
- **On-chain tree construction**: The operator builds the Merkle root directly from Registry state via `updateMerkleRootFromRegistry()` — no off-chain trust assumption

### 5. Economic Cryptography (Staking/Slashing)

Creates an economic security layer on top of cryptographic security:

- **Issuer staking**: Credential issuers must stake native tokens to register, creating skin-in-the-game. Minimum stake enforced on-chain.
- **Slashing**: Fraudulent issuers get slashed (50% penalty). The `slashIssuer()` function is callable by the owner when fraud is proven.
- **7-day lock period**: Prevents flash-stake attacks where issuers stake momentarily to issue credentials then immediately withdraw
- **Recovery mechanism**: `increaseStake()` allows slashed issuers to rebuild their stake and resume operations
- **Permanent record**: Slash count is tracked on-chain and never resets — reputation damage is permanent

This creates a game-theoretic incentive: issuing fraudulent credentials is economically irrational because the expected slashing penalty exceeds any gain from fake credentials.

---

## Flare Integration

SkillProof uses **Flare's enshrined data protocols** — not third-party oracle services — making our oracle security equivalent to the network's own security.

### FTSO (Flare Time Series Oracle) — Two Distinct Use Cases

#### Use Case 1: Credential Attestation

**Contract:** `SkillProofAttestor.sol`

The Attestor reads the FTSO FLR/USD price feed to timestamp and attest credentials with oracle-verified market data. This creates a **provable link** between when a credential was issued and the state of the market at that moment.

```solidity
import {TestFtsoV2Interface} from
    "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
import {ContractRegistry} from
    "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";

// Dynamic resolution — never hardcode oracle addresses
TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
(uint256 feedValue, int8 decimals, uint64 timestamp) =
    ftsoV2.getFeedById(FLR_USD_FEED_ID);
```

#### Use Case 2: Prediction Market Resolution

**Contract:** `SkillProofHub.sol` (Predict module)

The Predict module creates markets anchored to FTSO feed IDs. Markets resolve by reading live FTSO prices on-chain — **fully trustless, no manual resolution, no dispute process**.

```solidity
// Market stores which feed to resolve against
struct Market {
    bytes21 feedId;      // e.g., FLR/USD, BTC/USD, ETH/USD
    int256 targetPrice;  // "Will FLR exceed $1.00?"
    int256 actualPrice;  // Filled on resolution from FTSO
    // ...
}

// Resolution reads live oracle price
function resolveMarket(uint256 marketId) external {
    TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
    (uint256 feedValue, int8 decimals,) = ftsoV2.getFeedById(m.feedId);
    m.actualPrice = int256(feedValue);
    m.resolved = true;
}
```

### Feed IDs Used

| Feed | ID | Contract | Usage |
|------|-----|----------|-------|
| FLR/USD | `0x01464c522f55534400000000000000000000000000` | Attestor + Hub | Credential attestation + prediction market |
| BTC/USD | `0x014254432f55534400000000000000000000000000` | Hub | Prediction market: "Will BTC exceed $100,000?" |
| ETH/USD | `0x014554482f55534400000000000000000000000000` | Hub | Prediction market: "Will ETH exceed $4,000?" |

### Why Flare (Not Chainlink, Not UMA)

- **Enshrined oracle**: FTSO is secured by the full economic weight of the Flare network, not a third-party service that can be bribed or shut down independently
- **Free view calls**: No per-query fees on Coston2 — we can read prices in every transaction without cost overhead
- **ContractRegistry pattern**: `ContractRegistry.getTestFtsoV2()` dynamically resolves to the latest oracle address, so our contracts never hardcode addresses that could become stale
- **90-second update cadence** with block-latency fast updates — fresh enough for prediction market resolution without the staleness risk of slower oracles

---

## Flare Bonus: External Data Source Innovation

SkillProof brings **external real-world competence data on-chain** as a new category of oracle-attested information.

Skill platforms — trading competitions (FinCraft Arena, Loaf Markets), competitive programming (LeetCode), chess platforms (chess.com), and esports — generate massive amounts of competence data. Today, this data lives in **siloed databases** with no portability and no composability.

SkillProof creates a bridge:

1. **Skill platforms issue soulbound credentials** with ELO ratings, percentiles, match histories, and domain tags
2. **Flare's FTSO attestation layer timestamps each credential** against real market data, creating a cryptographic proof that the credential existed at a specific oracle moment
3. **ZK circuits enable privacy-preserving verification** — prove you're skilled without revealing your exact stats
4. **The prediction market module creates a feedback loop**: on-chain FTSO data resolves markets that are themselves skill-gated by external competence credentials

This is a novel data category for Flare's ecosystem: **human competence as an on-chain primitive**, attested by enshrined oracles and verified by zero-knowledge proofs.

---

## Building on Flare — Developer Experience

### What Worked Well

- **ContractRegistry pattern is elegant.** Dynamic resolution via `ContractRegistry.getTestFtsoV2()` means we never hardcode oracle addresses. When Flare upgrades their oracle implementation, our contracts automatically resolve to the new version. This is better than Chainlink's static address model.
- **flare-periphery-contracts package is clean.** `npm install @flarenetwork/flare-periphery-contracts` gives you typed Solidity interfaces that import cleanly. The `TestFtsoV2Interface` has a simple, well-designed API surface.
- **Coston2 testnet was stable.** Zero downtime during the hackathon. Blocks mined consistently, transactions confirmed within seconds.
- **Free FTSO view calls.** Being able to read price feeds in any transaction without worrying about per-query costs made rapid iteration painless. We could test prediction market resolution dozens of times without any cost overhead.
- **Faucet reliability.** The Coston2 faucet worked every time we needed test tokens.

### What Was Challenging

- **TestFtsoV2Interface vs production interfaces.** Initial confusion about which interface to import for Coston2 — the documentation could be clearer about `TestFtsoV2Interface` being the correct import for testnet and what the equivalent is for mainnet.
- **Feed ID format.** Finding the correct `bytes21` feed ID format required digging through example code rather than finding a clear reference table. A "Feed ID Cheat Sheet" in the quickstart guide would save every hackathon team 30 minutes.
- **Notion hackathon guide rendering.** The hackathon documentation on Notion didn't render well without JavaScript, making it hard to search and reference during development.

### What We'd Love to See

- **"Flare for Hackathons" quickstart**: A single page with copy-paste Hardhat config, a feed ID table for all supported assets, and a minimal working FTSO consumer contract (10 lines of Solidity that reads a price).
- **FDC documentation**: More concrete examples for Web2 data attestation use cases — especially for bringing off-chain API data on-chain, which is directly relevant to skill credential issuance.
- **Feed ID explorer**: A simple web tool where you can browse available feeds and copy their `bytes21` IDs.

---

## SDK

The `sdk/` directory provides a TypeScript SDK with **14 methods** for integrating SkillProof into any protocol:

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

**Available methods:** `getCredential`, `hasCredential`, `getEffectiveElo`, `getDecayedElo`, `getReputationBonus`, `getDecayMultiplier`, `getEffectiveVotingPower`, `checkGate`, `getAggregateScore`, `getLinkedAddresses`, `isZKVerified`, `getVerifiedThreshold`, `getLeaderboard`, `getProtocolStats`

See [sdk/README.md](sdk/README.md) for full API reference and runnable examples.

---

## Hub Modules

### Vault — Skill-Gated DeFi

Anyone can deposit C2FLR. Only players with **ELO >= 1500** can withdraw. This creates a skill-verified DeFi primitive — the vault's withdrawal gate reads directly from the Registry contract.

### Govern — Skill-Weighted DAO

Proposals are voted on with weight equal to the voter's **skill percentile** plus their reputation bonus. A 95th percentile player's vote carries ~19x the weight of a 5th percentile player. This is governance by demonstrated competence, not by capital.

### Predict — Oracle-Resolved Markets

Commit-reveal prediction markets anchored to **Flare FTSO feeds**. Three seeded markets: FLR/USD, BTC/USD, ETH/USD. Markets resolve by reading live oracle prices — no manual resolution, no dispute process. Correct predictions earn **+10 reputation** in the flywheel.

### Arena — Anonymous Bounties

Skill challenges with C2FLR rewards escrowed on-chain. Solutions use commit-reveal to prevent plagiarism. The poster awards the bounty to the best solution. Winning earns **+15 reputation**.

---

## Tests

**284 passing, 1 pending** (the pending test requires a live Flare Coston2 FTSO oracle)

| Test File | Count |
|-----------|-------|
| SkillProofRegistry.test.ts | 30 |
| SkillProofHub.test.ts | 57 passing, 1 pending |
| SkillProofVerifier.test.ts | 36 |
| SkillProofZKVerifier.test.ts | 15 |
| SkillProofDecay.test.ts | 28 |
| SkillProofAggregator.test.ts | 16 |
| SkillProofStaking.test.ts | 28 |
| SkillProofTreasury.test.ts | 23 |
| SkillProofEngine.test.ts | 32 |
| SkillProofMatchVerifier.test.ts | 19 |

ZK tests use **real Groth16 proofs** generated from the actual circom2 circuits — not mocked verifiers.

---

## Getting Started

```bash
# Prerequisites: Node.js >= 18, npm
git clone https://github.com/Tensored-Flow/SkillProof.git
cd SkillProof
npm install
cp .env.example .env  # Add your PRIVATE_KEY

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test
```

### Deploy to Coston2

```bash
# Core protocol
npx hardhat run scripts/deploy.ts --network coston2
npx hardhat run scripts/seed.ts --network coston2
npx hardhat run scripts/deploy-attestor.ts --network coston2
npx hardhat run scripts/deploy-hub.ts --network coston2
npx hardhat run scripts/seed-hub.ts --network coston2

# Verification layer
npx hardhat run scripts/deploy-verifier.ts --network coston2
npx hardhat run scripts/deploy-zk-verifier.ts --network coston2

# Extensions
npx hardhat run scripts/deploy-decay.ts --network coston2
npx hardhat run scripts/deploy-aggregator.ts --network coston2
npx hardhat run scripts/deploy-staking.ts --network coston2
npx hardhat run scripts/deploy-treasury.ts --network coston2
npx hardhat run scripts/deploy-engine.ts --network coston2
npx hardhat run scripts/deploy-match-verifier.ts --network coston2

# Seed multi-issuer and multi-feed data
npx hardhat run scripts/seed-multi-issuer.ts --network coston2
npx hardhat run scripts/seed-multi-feed.ts --network coston2
```

### Generate ZK Proofs

```bash
# Threshold proof (ELO >= 1500)
ELO=1847 THRESHOLD=1500 SALT=12345 npx hardhat run scripts/generate-zk-proof.ts

# Submit to Coston2
ELO=1847 THRESHOLD=1500 SALT=12345 SUBMIT=true \
  npx hardhat run scripts/generate-zk-proof.ts --network coston2

# Match history proof (>= 10 matches, >= 60% win rate)
TOTAL_MATCHES=12 WINS=8 MIN_MATCHES=10 MIN_WIN_RATE=6000 SALT=54321 \
  npx hardhat run scripts/generate-match-proof.ts

# Submit to Coston2
TOTAL_MATCHES=12 WINS=8 MIN_MATCHES=10 MIN_WIN_RATE=6000 SALT=54321 SUBMIT=true \
  npx hardhat run scripts/generate-match-proof.ts --network coston2
```

---

## Project Structure

```
contracts/
  SkillProofRegistry.sol        — Soulbound credential storage (ELO, percentiles, domains)
  SkillProofAttestor.sol        — FTSO oracle attestation layer
  SkillProofHub.sol             — Vault + Govern + Predict + Arena modules
  SkillProofVerifier.sol        — Merkle proof verification + threshold proofs
  Groth16Verifier.sol           — Auto-generated Groth16 SNARK verifier
  SkillProofZKVerifier.sol      — ZK-SNARK threshold proof wrapper
  SkillProofDecay.sol           — Time-weighted credential decay
  SkillProofAggregator.sol      — Multi-issuer credential aggregation
  SkillProofStaking.sol         — Issuer staking + slashing
  SkillProofTreasury.sol        — Protocol fee collection + revenue analytics
  SkillProofEngine.sol          — On-chain ELO engine with K-factors (32/24/16)
  MatchHistoryVerifier.sol      — Auto-generated Groth16 verifier (match history)
  SkillProofMatchVerifier.sol   — ZK match history proof wrapper
circuits/
  threshold_proof.circom        — Proves ELO >= threshold (36 constraints)
  match_history_proof.circom    — Proves match count + win rate (176 constraints)
  build/                        — Compiled WASM, zkey, verification keys
sdk/
  index.ts                      — SkillProof class (14 methods)
  README.md                     — API reference + examples
  examples/gate-example.ts      — Runnable demo against live Coston2
scripts/
  deploy*.ts                    — Deploy scripts (11 contracts)
  seed*.ts                      — Seed data scripts
  generate-zk-proof.ts          — Threshold proof generation
  generate-match-proof.ts       — Match history proof generation
  attest.ts                     — FTSO attestation runner
test/                           — 284 tests across 10 files
lib/
  deployments.json              — Contract addresses per network
  *.json                        — 13 ABI files
frontend/                       — Next.js frontend (6 pages, demo + live modes)
```

---

## The Numbers

| Metric | Count |
|--------|-------|
| Smart Contracts | **13** |
| Tests Passing | **284** |
| ZK Circuits | **2** (212 total constraints) |
| Crypto Primitives | **5** |
| FTSO Feed Integrations | **3** (FLR/USD, BTC/USD, ETH/USD) |
| Hub Modules | **4** (Vault, Govern, Predict, Arena) |
| SDK Methods | **14** |
| Frontend Pages | **6** |

---

## Tech Stack

- **Solidity ^0.8.25** — 13 contracts compiled with `viaIR: true` + optimizer (200 runs)
- **Hardhat 2.22** — Build, test, deploy
- **circom2 + snarkjs 0.7.6** — ZK-SNARK circuit compilation and Groth16 proof generation
- **Flare FTSOv2** — Enshrined on-chain price oracle (3 feeds)
- **Flare Coston2** — Testnet (chain ID 114)
- **Next.js 16** — Frontend with dual-mode (demo / live contract)
- **ethers.js v6** — Contract interaction
- **TypeScript SDK** — Developer integration library

## License

MIT

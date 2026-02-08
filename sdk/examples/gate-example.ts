import { SkillProof } from "../index";
import deployments from "../../lib/deployments.json";

const RPC_URL = "https://coston2-api.flare.network/ext/C/rpc";

async function main() {
  const sdk = new SkillProof(RPC_URL);

  // Use the registry owner (deployer) as the test address —
  // this is the account that seeded credentials on Coston2.
  const registryContract = new (await import("ethers")).Contract(
    deployments.coston2.SkillProofRegistry,
    [{ inputs: [], name: "owner", outputs: [{ type: "address" }], stateMutability: "view", type: "function" }],
    new (await import("ethers")).JsonRpcProvider(RPC_URL)
  );
  const testAddr = await registryContract.owner();

  console.log("=== SkillProof SDK Demo ===\n");
  console.log("Test address:", testAddr);

  // ── 1. Get credential ──
  const cred = await sdk.getCredential(testAddr);
  if (cred) {
    console.log("\n── Credential ──");
    console.log(`  Player:      ${cred.playerName}`);
    console.log(`  ELO:         ${cred.overallElo}`);
    console.log(`  Percentile:  ${cred.percentile}`);
    console.log(`  Domains:     ${cred.domains.join(", ")}`);
    console.log(`  Matches:     ${cred.totalMatches}`);
    console.log(`  Win Rate:    ${cred.winRate}%`);
  } else {
    console.log("\nNo credential found for this address.");
    return;
  }

  // ── 2. ELO variants ──
  console.log("\n── ELO Variants ──");
  const [effective, decayed, repBonus, decayMult] = await Promise.all([
    sdk.getEffectiveElo(testAddr),
    sdk.getDecayedElo(testAddr),
    sdk.getReputationBonus(testAddr),
    sdk.getDecayMultiplier(testAddr),
  ]);
  console.log(`  Base ELO:        ${cred.overallElo}`);
  console.log(`  Effective ELO:   ${effective} (base + reputation)`);
  console.log(`  Decayed ELO:     ${decayed} (base * ${decayMult / 100}%)`);
  console.log(`  Reputation:      ${repBonus}`);

  // ── 3. Skill gates ──
  console.log("\n── Skill Gates ──");

  const gate1 = await sdk.checkGate(testAddr, { minElo: 1500 });
  console.log(`  Gate (ELO >= 1500):  ${gate1.passed ? "PASS" : "FAIL"} ${gate1.reason || ""}`);

  const gate2 = await sdk.checkGate(testAddr, { minElo: 2500 });
  console.log(`  Gate (ELO >= 2500):  ${gate2.passed ? "PASS" : "FAIL"} ${gate2.reason || ""}`);

  const gate3 = await sdk.checkGate(testAddr, {
    minElo: 1500,
    useEffectiveElo: true,
    requiredDomains: cred.domains.slice(0, 1), // use first domain as test
  });
  console.log(`  Gate (effective + domain): ${gate3.passed ? "PASS" : "FAIL"} ${gate3.reason || ""}`);

  const gate4 = await sdk.checkGate(testAddr, { minPercentile: 95 });
  console.log(`  Gate (top 5%):       ${gate4.passed ? "PASS" : "FAIL"} ${gate4.reason || ""}`);

  // ── 4. Aggregate score ──
  console.log("\n── Aggregate Score ──");
  const agg = await sdk.getAggregateScore(testAddr);
  console.log(`  Composite ELO:   ${agg.compositeElo}`);
  console.log(`  Issuers:         ${agg.issuerCount}`);
  console.log(`  Domains:         ${agg.domainCount}`);
  console.log(`  Cross-domain:    +${agg.crossDomainBonus}`);
  console.log(`  Overall Score:   ${agg.overallScore}`);

  // ── 5. ZK verification status ──
  console.log("\n── ZK Verification ──");
  const zkVerified = await sdk.isZKVerified(testAddr);
  console.log(`  ZK Verified:     ${zkVerified}`);
  if (zkVerified) {
    const threshold = await sdk.getVerifiedThreshold(testAddr);
    console.log(`  Threshold:       ${threshold}`);
  }

  // ── 6. Protocol stats ──
  console.log("\n── Protocol Stats ──");
  const stats = await sdk.getProtocolStats();
  console.log(`  Merkle verifications: ${stats.merkleVerifications}`);
  console.log(`  ZK verifications:     ${stats.zkVerifications}`);
  console.log(`  Markets:              ${stats.totalMarkets}`);
  console.log(`  Bounties:             ${stats.totalBounties}`);
  console.log(`  Proposals:            ${stats.totalProposals}`);
  console.log(`  Participants:         ${stats.totalParticipants}`);

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);

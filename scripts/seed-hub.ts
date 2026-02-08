import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load deployment addresses
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  const hubAddress = deployments[networkName]?.SkillProofHub;
  if (!hubAddress) {
    throw new Error(`No SkillProofHub found for "${networkName}". Run deploy-hub.ts first.`);
  }

  const registryAddress = deployments[networkName]?.SkillProofRegistry;
  if (!registryAddress) {
    throw new Error(`No SkillProofRegistry found for "${networkName}".`);
  }

  // Load ABIs
  const hubAbi = JSON.parse(fs.readFileSync(path.join(libDir, "hub-abi.json"), "utf-8"));
  const registryAbi = JSON.parse(fs.readFileSync(path.join(libDir, "abi.json"), "utf-8"));

  const [deployer] = await ethers.getSigners();
  console.log("Seeding SkillProofHub with account:", deployer.address);
  console.log("Hub address:", hubAddress);

  const hub = new ethers.Contract(hubAddress, hubAbi, deployer);
  const registry = new ethers.Contract(registryAddress, registryAbi, deployer);

  // ── Ensure deployer is a registered issuer & has a credential ──
  const hasCred = await registry.hasCredential(deployer.address);
  if (!hasCred) {
    // Register as issuer first (idempotent — will revert if already registered, so we try/catch)
    try {
      const txIssuer = await registry.registerIssuer(deployer.address, "HubSeeder");
      await txIssuer.wait();
      console.log("Registered deployer as issuer");
    } catch {
      console.log("Deployer already registered as issuer (or was in previous seed)");
    }

    console.log("\n── Minting credential for deployer ──");
    const tx = await registry.mintCredential(
      deployer.address, "HubDeployer", 1750, 88,
      ["Smart Contracts", "DeFi"], [1800, 1700], [90, 85], 200, 65
    );
    console.log("mintCredential tx:", tx.hash);
    await tx.wait();
    console.log("Deployer credential minted (ELO: 1750, percentile: 88)");
  } else {
    console.log("Deployer already has credential");
  }

  // Current block timestamp for deadline calculations
  const block = await ethers.provider.getBlock("latest");
  const now = block!.timestamp;

  // ══════════════════════════════════════════════════════════════════════
  // Module 1 — VAULT: Deposit 1 C2FLR
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Module 1: Vault ──");
  const tx1 = await hub.deposit({ value: ethers.parseEther("1.0") });
  console.log("deposit tx:", tx1.hash);
  await tx1.wait();
  console.log("✅ Deposited 1 C2FLR to vault");

  // ══════════════════════════════════════════════════════════════════════
  // Module 2 — GOVERN: Create proposal + vote
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Module 2: Govern ──");
  const proposalDesc = "Should SkillProof integrate with Aave for skill-gated lending?";
  const proposalDeadline = now + 7 * 24 * 3600; // +7 days
  const tx2 = await hub.createProposal(proposalDesc, proposalDeadline);
  console.log("createProposal tx:", tx2.hash);
  await tx2.wait();
  console.log("✅ Created proposal: Should SkillProof integrate with Aave for skill-gated lending?");

  try {
    const tx3 = await hub.vote(0, true);
    console.log("vote tx:", tx3.hash);
    await tx3.wait();
    console.log("✅ Voted YES on proposal 0 (weight = deployer percentile)");
  } catch {
    console.log("Already voted on proposal 0 (skipping)");
  }

  // ══════════════════════════════════════════════════════════════════════
  // Module 3 — PREDICT: Create prediction market
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Module 3: Predict ──");
  const question = "Will FLR exceed $1.00 USD by end of Q1 2025?";
  const feedId = "0x01464c522f55534400000000000000000000000000"; // FLR/USD
  const targetPrice = 1000000; // $1.00 — scaled to match FTSO feed precision
  const commitDeadline = now + 86400;  // +1 day
  const revealDeadline = now + 172800; // +2 days
  const tx4 = await hub.createMarket(question, feedId, targetPrice, commitDeadline, revealDeadline);
  console.log("createMarket tx:", tx4.hash);
  await tx4.wait();
  console.log("✅ Created prediction market: Will FLR exceed $1.00 USD by end of Q1 2025?");

  // ── Multi-Feed Markets: BTC/USD and ETH/USD ──

  const btcFeedId = "0x014254432f55534400000000000000000000000000"; // BTC/USD
  const btcQuestion = "Will BTC exceed $100,000 USD?";
  const btcTargetPrice = 10000000000; // $100,000 at 5-decimal scale
  const tx4b = await hub.createMarket(btcQuestion, btcFeedId, btcTargetPrice, now + 86400, now + 172800);
  console.log("createMarket tx:", tx4b.hash);
  await tx4b.wait();
  console.log("✅ Created prediction market: Will BTC exceed $100,000... (BTC/USD feed)");

  const ethFeedId = "0x014554482f55534400000000000000000000000000"; // ETH/USD
  const ethQuestion = "Will ETH exceed $4,000 USD?";
  const ethTargetPrice = 400000000; // $4,000 at 5-decimal scale
  const tx4c = await hub.createMarket(ethQuestion, ethFeedId, ethTargetPrice, now + 86400, now + 172800);
  console.log("createMarket tx:", tx4c.hash);
  await tx4c.wait();
  console.log("✅ Created prediction market: Will ETH exceed $4,000... (ETH/USD feed)");

  // ══════════════════════════════════════════════════════════════════════
  // Module 4 — ARENA: Post bounty with 0.5 C2FLR reward
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Module 4: Arena ──");
  const bountyDesc = "Build a SkillProof SDK for JavaScript developers";
  const bountyCommitDeadline = now + 86400;  // +1 day
  const bountyDeadline = now + 259200;       // +3 days
  const tx5 = await hub.postBounty(bountyDesc, bountyCommitDeadline, bountyDeadline, {
    value: ethers.parseEther("0.5"),
  });
  console.log("postBounty tx:", tx5.hash);
  await tx5.wait();
  console.log("✅ Posted bounty: Build a SkillProof SDK for JavaScript developers (reward: 0.5 C2FLR)");

  // ══════════════════════════════════════════════════════════════════════
  // Module 5 — REPUTATION: Log initial state after seeding
  // ══════════════════════════════════════════════════════════════════════

  console.log("\n── Module 5: Reputation (post-seed stats) ──");
  const pCount = await hub.participantCount();
  console.log("Participant count:", pCount.toString());

  const deployerElo = await hub.getEffectiveElo(deployer.address);
  const deployerRep = await hub.getReputation(deployer.address);
  const deployerVP = await hub.getEffectiveVotingPower(deployer.address);
  console.log(`Deployer effective ELO: ${deployerElo.toString()} (reputation bonus: ${deployerRep.toString()})`);
  console.log(`Deployer effective voting power: ${deployerVP.toString()}`);

  // ══════════════════════════════════════════════════════════════════════
  // LOCALHOST ONLY: Demo reputation flywheel with testResolveMarket
  // ══════════════════════════════════════════════════════════════════════

  if (networkName === "localhost") {
    console.log("\n── Reputation Flywheel Demo (localhost only) ──");

    // Create a quick market, commit, reveal, resolve — show reputation change
    const demoQ = "Demo market: Will FLR hit $2?";
    const demoFeedId = "0x01464c522f55534400000000000000000000000000";
    const demoTarget = 2000000; // $2.00
    const demoCommit = now + 300;  // +5 min
    const demoReveal = now + 600;  // +10 min

    const txDemo1 = await hub.createMarket(demoQ, demoFeedId, demoTarget, demoCommit, demoReveal);
    await txDemo1.wait();
    const demoMarketId = Number(await hub.marketCount()) - 1;
    console.log(`Created demo market #${demoMarketId}`);

    // Commit a prediction (predict YES — price will exceed target)
    const salt = ethers.encodeBytes32String("demosalt");
    const commitHash = ethers.solidityPackedKeccak256(["bool", "bytes32"], [true, salt]);
    const txDemo2 = await hub.commitPrediction(demoMarketId, commitHash);
    await txDemo2.wait();
    console.log("Committed prediction (YES)");

    // Fast-forward time past commit deadline, then reveal
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);

    const txDemo3 = await hub.revealPrediction(demoMarketId, true, salt);
    await txDemo3.wait();
    console.log("Revealed prediction (YES)");

    // Fast-forward past reveal deadline, then resolve with mock price above target
    await ethers.provider.send("evm_increaseTime", [301]);
    await ethers.provider.send("evm_mine", []);

    const txDemo4 = await hub.testResolveMarket(demoMarketId, 2500000); // $2.50 > $2.00 → YES wins
    await txDemo4.wait();
    console.log("Resolved market with mock price $2.50 (YES wins)");

    const postRep = await hub.getReputation(deployer.address);
    const postElo = await hub.getEffectiveElo(deployer.address);
    console.log(`Deployer reputation after correct prediction: ${postRep.toString()} (+10)`);
    console.log(`Deployer effective ELO after flywheel: ${postElo.toString()}`);
  }

  // ── Summary ──
  console.log("\n══════════════════════════════════════");
  console.log("       HUB SEEDING COMPLETE");
  console.log("══════════════════════════════════════");
  console.log("Hub address:     ", hubAddress);
  console.log("Vault balance:   ", ethers.formatEther(await hub.getVaultBalance()), "C2FLR");
  console.log("Proposals:       ", (await hub.proposalCount()).toString());
  console.log("Markets:         ", (await hub.marketCount()).toString());
  console.log("Bounties:        ", (await hub.bountyCount()).toString());
  console.log("Participants:    ", (await hub.participantCount()).toString());
  const finalRep = await hub.getReputation(deployer.address);
  const finalElo = await hub.getEffectiveElo(deployer.address);
  console.log(`Deployer rep:     ${finalRep.toString()} | effective ELO: ${finalElo.toString()}`);
  console.log("══════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

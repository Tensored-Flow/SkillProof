import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofTreasury with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

  const credentialMintFee = ethers.parseEther("0.01");
  const marketCreationFee = ethers.parseEther("0.05");
  const verificationFee = ethers.parseEther("0.005");
  const bountyCommissionBps = 500; // 5%

  console.log("Fee schedule:");
  console.log("  Credential mint:", ethers.formatEther(credentialMintFee), "FLR");
  console.log("  Market creation:", ethers.formatEther(marketCreationFee), "FLR");
  console.log("  Verification:", ethers.formatEther(verificationFee), "FLR");
  console.log("  Bounty commission:", bountyCommissionBps / 100, "%");

  // Deploy
  const Factory = await ethers.getContractFactory("SkillProofTreasury");
  const treasury = await Factory.deploy(
    credentialMintFee,
    marketCreationFee,
    verificationFee,
    bountyCommissionBps
  );
  await treasury.waitForDeployment();

  const address = await treasury.getAddress();
  console.log("SkillProofTreasury deployed to:", address);

  // Update deployments.json
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  if (!deployments[networkName]) deployments[networkName] = {};
  deployments[networkName].SkillProofTreasury = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofTreasury.sol", "SkillProofTreasury.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "treasury-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/treasury-abi.json");

  // ── Seed: Pay credential fees ──
  console.log("\n── Seeding: Credential Fees ──");
  const tx1 = await treasury.payCredentialFee(deployer.address, { value: credentialMintFee });
  await tx1.wait();
  console.log("Paid credential fee #1 (0.01 FLR)");

  const tx2 = await treasury.payCredentialFee(deployer.address, { value: credentialMintFee });
  await tx2.wait();
  console.log("Paid credential fee #2 (0.01 FLR)");

  // ── Seed: Pay market creation fees ──
  console.log("\n── Seeding: Market Fees ──");
  const tx3 = await treasury.payMarketFee({ value: marketCreationFee });
  await tx3.wait();
  console.log("Paid market creation fee (0.05 FLR)");

  // ── Seed: Pay verification fee ──
  console.log("\n── Seeding: Verification Fee ──");
  const tx4 = await treasury.payVerificationFee({ value: verificationFee });
  await tx4.wait();
  console.log("Paid verification fee (0.005 FLR)");

  // ── Seed: Take snapshot ──
  console.log("\n── Taking Revenue Snapshot ──");
  const tx5 = await treasury.takeSnapshot();
  await tx5.wait();
  console.log("Snapshot taken");

  // ── Print summary ──
  const [credentials, markets, verifications, bounties, total] =
    await treasury.getRevenueBreakdown();
  const [credCount, marketCount, verifyCount, bountyCount, revenue, snapCount] =
    await treasury.getProtocolMetrics();

  console.log("\n── Revenue Summary ──");
  console.log("Credential fees:", ethers.formatEther(credentials), "FLR");
  console.log("Market fees:", ethers.formatEther(markets), "FLR");
  console.log("Verification fees:", ethers.formatEther(verifications), "FLR");
  console.log("Bounty commissions:", ethers.formatEther(bounties), "FLR");
  console.log("Total revenue:", ethers.formatEther(total), "FLR");
  console.log("\n── Metrics ──");
  console.log("Credentials minted:", credCount.toString());
  console.log("Markets created:", marketCount.toString());
  console.log("Verifications:", verifyCount.toString());
  console.log("Bounties processed:", bountyCount.toString());
  console.log("Snapshots:", snapCount.toString());
  console.log("Contract:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

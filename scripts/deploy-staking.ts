import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofStaking with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

  const minimumStake = ethers.parseEther("0.1");
  const slashPercentage = 5000; // 50%

  console.log("Minimum stake:", ethers.formatEther(minimumStake), "C2FLR");
  console.log("Slash percentage:", slashPercentage / 100, "%");

  // Deploy
  const Factory = await ethers.getContractFactory("SkillProofStaking");
  const staking = await Factory.deploy(minimumStake, slashPercentage);
  await staking.waitForDeployment();

  const address = await staking.getAddress();
  console.log("SkillProofStaking deployed to:", address);

  // Update deployments.json
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  if (!deployments[networkName]) deployments[networkName] = {};
  deployments[networkName].SkillProofStaking = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofStaking.sol", "SkillProofStaking.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "staking-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/staking-abi.json");

  // ── Stake as FinCraft issuer (deployer) ──
  console.log("\n── Staking as FinCraft ──");
  const tx1 = await staking.stake("FinCraft", { value: ethers.parseEther("0.2") });
  await tx1.wait();
  console.log("Staked 0.2 C2FLR as FinCraft");

  // ── Stake as ChessArena issuer (if second signer available) ──
  const signers = await ethers.getSigners();
  if (signers.length >= 2) {
    const chessIssuer = signers[1];
    const chessBalance = await ethers.provider.getBalance(chessIssuer.address);
    if (chessBalance >= ethers.parseEther("0.15")) {
      console.log("\n── Staking as ChessArena ──");
      const tx2 = await staking.connect(chessIssuer).stake("ChessArena", {
        value: ethers.parseEther("0.15"),
      });
      await tx2.wait();
      console.log("Staked 0.15 C2FLR as ChessArena (", chessIssuer.address, ")");
    } else {
      console.log("\nSkipping ChessArena stake — second signer has insufficient balance");
    }
  } else {
    console.log("\nOnly one signer available — skipping ChessArena stake");
  }

  // ── Print summary ──
  const totalStaked = await staking.totalStaked();
  const issuerCount = await staking.getStakedIssuerCount();
  console.log("\n── Summary ──");
  console.log("Total staked:", ethers.formatEther(totalStaked), "C2FLR");
  console.log("Staked issuers:", issuerCount.toString());
  console.log("Contract:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

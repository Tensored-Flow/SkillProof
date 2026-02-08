import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofHub with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

  // Read deployment addresses
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";

  const registryAddress = deployments[networkName]?.SkillProofRegistry;
  if (!registryAddress) {
    throw new Error(`No SkillProofRegistry found for network "${networkName}". Run deploy.ts first.`);
  }
  console.log("Using SkillProofRegistry at:", registryAddress);

  const attestorAddress = deployments[networkName]?.SkillProofAttestor || ethers.ZeroAddress;
  console.log("Using SkillProofAttestor at:", attestorAddress);

  const vaultEloThreshold = 1500;
  console.log("Vault ELO threshold:", vaultEloThreshold);

  // Deploy SkillProofHub
  const Factory = await ethers.getContractFactory("SkillProofHub");
  const hub = await Factory.deploy(registryAddress, attestorAddress, vaultEloThreshold);
  await hub.waitForDeployment();

  const address = await hub.getAddress();
  console.log("SkillProofHub deployed to:", address);

  // Update deployments.json
  deployments[networkName].SkillProofHub = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract ABI from compiled artifact and save to lib/hub-abi.json
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofHub.sol", "SkillProofHub.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "hub-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/hub-abi.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

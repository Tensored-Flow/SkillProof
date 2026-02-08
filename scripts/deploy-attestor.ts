import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillProofAttestor with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "C2FLR");

  // Read registry address from deployments.json
  const libDir = path.join(__dirname, "..", "lib");
  const deploymentsPath = path.join(libDir, "deployments.json");
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";
  const registryAddress = deployments[networkName]?.SkillProofRegistry;

  if (!registryAddress) {
    throw new Error(`No SkillProofRegistry found for network "${networkName}"`);
  }
  console.log("Using SkillProofRegistry at:", registryAddress);

  // Deploy SkillProofAttestor
  const Factory = await ethers.getContractFactory("SkillProofAttestor");
  const attestor = await Factory.deploy(registryAddress);
  await attestor.waitForDeployment();

  const address = await attestor.getAddress();
  console.log("SkillProofAttestor deployed to:", address);

  // Update deployments.json
  deployments[networkName].SkillProofAttestor = address;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + "\n");
  console.log("Updated lib/deployments.json");

  // Extract attestor ABI
  const artifactPath = path.join(
    __dirname, "..", "artifacts", "contracts",
    "SkillProofAttestor.sol", "SkillProofAttestor.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  fs.writeFileSync(
    path.join(libDir, "attestor-abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  console.log("Saved ABI to lib/attestor-abi.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

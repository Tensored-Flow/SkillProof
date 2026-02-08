import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load deployment address
  const deploymentsPath = path.join(__dirname, "..", "lib", "deployments.json");
  if (!fs.existsSync(deploymentsPath)) {
    throw new Error("lib/deployments.json not found. Run deploy.ts first.");
  }
  const deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"));

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";
  const registryAddress = deployments[networkName]?.SkillProofRegistry;
  if (!registryAddress) {
    throw new Error(`No deployment found for network "${networkName}"`);
  }

  // Load ABI
  const abiPath = path.join(__dirname, "..", "lib", "abi.json");
  if (!fs.existsSync(abiPath)) {
    throw new Error("lib/abi.json not found. Run deploy.ts first.");
  }
  const abi = JSON.parse(fs.readFileSync(abiPath, "utf-8"));

  const [deployer] = await ethers.getSigners();
  console.log("Seeding with account:", deployer.address);
  console.log("Contract address:", registryAddress);

  const registry = new ethers.Contract(registryAddress, abi, deployer);

  // Determine player addresses.
  // On local hardhat we have multiple signers; on coston2 we derive deterministic addresses.
  let player1Address: string;
  let player2Address: string;

  const signers = await ethers.getSigners();
  if (signers.length >= 3) {
    // Local hardhat network — use extra signers
    player1Address = signers[1].address;
    player2Address = signers[2].address;
  } else {
    // Coston2 / single-key network — derive deterministic addresses from a fixed mnemonic
    const mnemonic = "test test test test test test test test test test test junk";
    const player1Wallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/1"
    );
    const player2Wallet = ethers.HDNodeWallet.fromMnemonic(
      ethers.Mnemonic.fromPhrase(mnemonic),
      "m/44'/60'/0'/0/2"
    );
    player1Address = player1Wallet.address;
    player2Address = player2Wallet.address;
  }

  // ── Step 1: Register deployer as issuer "FinCraft" ──
  console.log("\n── Step 1: Register issuer ──");
  const tx1 = await registry.registerIssuer(deployer.address, "FinCraft");
  console.log("registerIssuer tx:", tx1.hash);
  const receipt1 = await tx1.wait();
  console.log("Confirmed in block:", receipt1.blockNumber);

  // ── Step 2: Mint credential for Player 1 (Leon Wang) ──
  console.log("\n── Step 2: Mint credential for Player 1 ──");
  const tx2 = await registry.mintCredential(
    player1Address,
    "Leon Wang",
    1847,
    96,
    ["Options Pricing", "Statistical Arbitrage", "Risk Management", "Portfolio Optimization", "Market Microstructure"],
    [1920, 1750, 1880, 1650, 1800],
    [95, 78, 91, 65, 84],
    342,
    6420
  );
  console.log("mintCredential (Player 1) tx:", tx2.hash);
  const receipt2 = await tx2.wait();
  console.log("Confirmed in block:", receipt2.blockNumber);

  // ── Step 3: Mint credential for Player 2 (Alex Chen) ──
  console.log("\n── Step 3: Mint credential for Player 2 ──");
  const tx3 = await registry.mintCredential(
    player2Address,
    "Alex Chen",
    1623,
    74,
    ["Options Pricing", "Statistical Arbitrage", "Risk Management", "Portfolio Optimization", "Market Microstructure"],
    [1580, 1700, 1550, 1680, 1600],
    [68, 80, 62, 77, 70],
    187,
    5810
  );
  console.log("mintCredential (Player 2) tx:", tx3.hash);
  const receipt3 = await tx3.wait();
  console.log("Confirmed in block:", receipt3.blockNumber);

  // ── Summary ──
  console.log("\n══════════════════════════════════════");
  console.log("Seeding complete!");
  console.log("Player 1 (Leon Wang):", player1Address);
  console.log("Player 2 (Alex Chen):", player2Address);
  console.log("══════════════════════════════════════");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

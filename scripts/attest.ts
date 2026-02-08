import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // Load deployment addresses
  const libDir = path.join(__dirname, "..", "lib");
  const deployments = JSON.parse(
    fs.readFileSync(path.join(libDir, "deployments.json"), "utf-8")
  );

  const network = await ethers.provider.getNetwork();
  const networkName = network.chainId === 114n ? "coston2" : "localhost";
  const attestorAddress = deployments[networkName]?.SkillProofAttestor;

  if (!attestorAddress) {
    throw new Error(`No SkillProofAttestor found for network "${networkName}". Run deploy-attestor.ts first.`);
  }

  const attestorAbi = JSON.parse(
    fs.readFileSync(path.join(libDir, "attestor-abi.json"), "utf-8")
  );

  const [deployer] = await ethers.getSigners();
  const attestor = new ethers.Contract(attestorAddress, attestorAbi, deployer);

  console.log("Attestor contract:", attestorAddress);
  console.log("Caller:", deployer.address);

  // Seeded player addresses
  const player1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const player2 = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  // Attest Player 1
  console.log("\n── Attesting Player 1 (Leon Wang) ──");
  const tx1 = await attestor.attestCredential(player1);
  console.log("tx:", tx1.hash);
  const receipt1 = await tx1.wait();
  console.log("Confirmed in block:", receipt1.blockNumber);

  // Attest Player 2
  console.log("\n── Attesting Player 2 (Alex Chen) ──");
  const tx2 = await attestor.attestCredential(player2);
  console.log("tx:", tx2.hash);
  const receipt2 = await tx2.wait();
  console.log("Confirmed in block:", receipt2.blockNumber);

  // Read attestations
  console.log("\n══════════════════════════════════════");
  console.log("       ATTESTATION RESULTS");
  console.log("══════════════════════════════════════");

  for (const [name, addr] of [["Leon Wang", player1], ["Alex Chen", player2]]) {
    const att = await attestor.getAttestation(addr);
    console.log(`\n${name} (${addr}):`);
    console.log("  isAttested:     ", att.isAttested);
    console.log("  attestedAt:     ", new Date(Number(att.attestedAt) * 1000).toISOString());
    console.log("  flareTimestamp: ", new Date(Number(att.flareTimestamp) * 1000).toISOString());
    console.log("  anchorPrice:    ", att.anchorPrice.toString());
    console.log("  pricePair:      ", att.pricePair);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

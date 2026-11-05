// scripts/check_deployment.js - CHI DOC. Doi chieu deployments/<mang>.json voi trang thai that tren chuoi.
//   npx hardhat run scripts/check_deployment.js --network sepolia
const fs = require("fs");
const path = require("path");
async function main() {
  const hre = require("hardhat");
  const { ethers, network } = hre;
  const file = path.join(__dirname, "..", "deployments", network.name + ".json");
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const rows = [];
  const add = (name, ok, detail) => rows.push([ok, name, detail]);
  add("chainId khop", chainId === d.chainId, chainId + " / " + d.chainId);
  const registry = await ethers.getContractAt("OrganizationRegistry", d.registry.address);
  const core = await ethers.getContractAt("ProjectCore", d.core.address);
  add("co ma OrganizationRegistry", (await ethers.provider.getCode(d.registry.address)) !== "0x", d.registry.address);
  add("co ma ProjectCore", (await ethers.provider.getCode(d.core.address)) !== "0x", d.core.address);
  add("ProjectCore.registry() tro dung", (await core.registry()) === d.registry.address, await core.registry());
  add("platformAdmin hien tai", true, await registry.platformAdmin());
  add("so to chuc / so cuoc bau cu", true, (await registry.organizationCount()) + " / " + (await core.electionCount()));
  add("deployBlock <= khoi hien tai", d.deployBlock <= (await ethers.provider.getBlockNumber()), String(d.deployBlock));
  for (const [ok, n, x] of rows) console.log((ok ? "PASS " : "FAIL ") + n + " :: " + x);
  if (rows.some((r) => !r[0])) process.exitCode = 1;
}
main().catch((e) => { console.error("LOI: " + e.message); process.exitCode = 1; });

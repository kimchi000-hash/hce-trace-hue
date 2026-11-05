// scripts/deploy_sepolia.js - Trien khai OrganizationRegistry roi ProjectCore(registry) va ghi deployments/<mang>.json.
//
//   Tap luyen cuc bo:  npx hardhat run scripts/deploy_sepolia.js
//   Sepolia that:      npx hardhat run scripts/deploy_sepolia.js --network sepolia
//
// An toan:
//  - Khoa bi mat chi doc tu .env (khong in ra, khong ghi vao file ket qua). File ket qua chi co dia chi/tx cong khai.
//  - Tren sepolia: kiem tra dung chainId 11155111 va du so du truoc khi gui giao dich.
//  - Khong ghi de deployments/<mang>.json da co (tranh vo tinh deploy lan 2 va mat dia chi); muon lam lai thi dat FORCE_REDEPLOY=1.
//  - Vi trien khai tro thanh quan tri vien nen tang (xac minh / tam ngung to chuc): dung vi RIENG de thu nghiem.
const fs = require("fs");
const path = require("path");

const SEPOLIA = 11155111;
const MIN_BALANCE_WEI = 20_000_000_000_000_000n; // 0.02 ETH: du cho 2 lan deploy voi du dia

async function deploy(hre, opts = {}) {
  const { ethers, network } = hre;
  if (network.name === "sepolia") {
    if (!process.env.SEPOLIA_RPC_URL) throw new Error("Thieu SEPOLIA_RPC_URL trong file .env (URL RPC Sepolia tu Alchemy/Infura).");
    if (!process.env.PRIVATE_KEY) throw new Error("Thieu PRIVATE_KEY trong file .env (khoa cua vi RIENG chi dung de thu nghiem, 0x + 64 hex).");
    if (process.env.PRIVATE_KEY && !/^0x[0-9a-fA-F]{64}$/.test(process.env.PRIVATE_KEY)) throw new Error("PRIVATE_KEY trong .env sai dinh dang (can 0x + 64 ky tu hex). Gia tri khong duoc in ra de bao mat.");
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Chua co vi de ky: dat SEPOLIA_RPC_URL va PRIVATE_KEY (0x + 64 hex) trong file .env roi chay lai voi --network sepolia.");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const expected = opts.expectedChainId ?? (network.name === "sepolia" ? SEPOLIA : chainId);
  if (chainId !== expected) throw new Error("Sai mang: RPC tra chainId " + chainId + ", mong doi " + expected + ". Kiem tra SEPOLIA_RPC_URL.");
  const out = opts.out || path.join(__dirname, "..", "deployments", network.name + ".json");
  if (fs.existsSync(out) && process.env.FORCE_REDEPLOY !== "1" && !opts.force) {
    throw new Error("Da co " + path.relative(process.cwd(), out) + " (da deploy roi). Neu that su muon deploy lai, dat FORCE_REDEPLOY=1; dia chi cu se bi thay.");
  }
  const balance = await ethers.provider.getBalance(deployer.address);
  if (network.name === "sepolia" && balance < MIN_BALANCE_WEI) {
    throw new Error("So du vi " + deployer.address + " la " + ethers.formatEther(balance) + " ETH, can it nhat 0.02 ETH Sepolia (lay tu faucet).");
  }
  const confirmations = opts.confirmations ?? (network.name === "sepolia" ? 2 : 1);
  const log = opts.log || console.log;

  log("Mang: " + network.name + " (chainId " + chainId + ") · vi trien khai: " + deployer.address + " · so du " + ethers.formatEther(balance) + " ETH");
  const Registry = await ethers.getContractFactory("OrganizationRegistry");
  const registry = await Registry.deploy();
  const regRc = await registry.deploymentTransaction().wait(confirmations);
  const registryAddress = await registry.getAddress();
  log("OrganizationRegistry: " + registryAddress + " (khoi " + regRc.blockNumber + ")");

  const Core = await ethers.getContractFactory("ProjectCore");
  const core = await Core.deploy(registryAddress);
  const coreRc = await core.deploymentTransaction().wait(confirmations);
  const coreAddress = await core.getAddress();
  log("ProjectCore:          " + coreAddress + " (khoi " + coreRc.blockNumber + ")");

  // Tu kiem tra tren chuoi truoc khi ghi ket qua.
  if ((await ethers.provider.getCode(registryAddress)) === "0x" || (await ethers.provider.getCode(coreAddress)) === "0x") throw new Error("Khong thay ma hop dong sau khi deploy.");
  if ((await core.registry()) !== registryAddress) throw new Error("ProjectCore khong tro dung ve OrganizationRegistry.");
  if ((await registry.platformAdmin()) !== deployer.address) throw new Error("platformAdmin khong phai vi trien khai.");
  if (Number(await registry.organizationCount()) !== 0 || Number(await core.electionCount()) !== 0) throw new Error("Hop dong moi phai trong.");

  const result = {
    network: network.name, chainId, deployedAt: new Date().toISOString(),
    deployer: deployer.address, platformAdmin: deployer.address,
    registry: { address: registryAddress, tx: registry.deploymentTransaction().hash, block: regRc.blockNumber },
    core: { address: coreAddress, tx: core.deploymentTransaction().hash, block: coreRc.blockNumber },
    // chain-sync quet su kien tu khoi nay: phai la khoi cua hop dong deploy SOM NHAT (registry), neu khong se mat su kien dang ky to chuc.
    deployBlock: Math.min(regRc.blockNumber, coreRc.blockNumber),
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  log("Da ghi " + path.relative(process.cwd(), out));
  return result;
}

function nextSteps(r) {
  const ex = r.chainId === SEPOLIA ? "https://sepolia.etherscan.io" : "";
  return [
    "",
    "=== BUOC TIEP THEO ===",
    "1) Dien vao supabase/.env.functions (khong commit):",
    "   REGISTRY_ADDRESS=" + r.registry.address,
    "   CORE_ADDRESS=" + r.core.address,
    "   DEPLOY_BLOCK=" + r.deployBlock,
    "   RPC_URL=<RPC Sepolia cua ban>",
    "2) Gan dia chi vao giao dien:  node scripts/apply_deployment.js " + r.network,
    ex ? "3) Xem tren Etherscan: " + ex + "/address/" + r.core.address : "",
  ].filter(Boolean).join("\n");
}

module.exports = { deploy, nextSteps };

if (require.main === module) {
  const hre = require("hardhat");
  deploy(hre).then((r) => console.log(nextSteps(r))).catch((e) => { console.error("\nLOI: " + e.message); process.exitCode = 1; });
}

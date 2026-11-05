require("@nomicfoundation/hardhat-toolbox");
const fs = require("fs");
const path = require("path");

// Doc .env (da nam trong .gitignore) KHONG can them thu vien. Khong bao gio in gia tri ra man hinh.
// Bien da co san trong moi truong (process.env) duoc uu tien hon file.
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
} catch (_) { /* khong co .env: van chay test binh thuong */ }

const { SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;
const keyOk = /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY || "");
// Luon khai bao mang sepolia de script bao loi than thien (thieu RPC / thieu vi) thay vi loi "network does not exist".
const networks = {
  sepolia: { url: SEPOLIA_RPC_URL || "http://127.0.0.1:1", chainId: 11155111, accounts: keyOk ? [PRIVATE_KEY] : [] },
};

/** Cau hinh Hardhat cho ECO2432 - Club Voting.
 *  Dung dung phien ban va tuy chon mac dinh cua Remix (khong bat optimizer)
 *  de so gas do bang Hardhat khop voi so do tren Remix.
 *  Mang sepolia can SEPOLIA_RPC_URL va PRIVATE_KEY (0x + 64 hex) trong .env; thieu thi script deploy bao ro thieu gi. */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: false } },
  },
  networks,
  etherscan: { apiKey: ETHERSCAN_API_KEY || "" },
  paths: { sources: "./contracts", tests: "./test" },
  gasReporter: { enabled: false },
};

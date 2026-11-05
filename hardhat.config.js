require("@nomicfoundation/hardhat-toolbox");

/** Cau hinh Hardhat cho ECO2432 - Club Voting.
 *  Dung dung phien ban va tuy chon mac dinh cua Remix (khong bat optimizer)
 *  de so gas do bang Hardhat khop voi so do tren Remix. */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: false } },
  },
  paths: { sources: "./contracts", tests: "./test" },
  gasReporter: { enabled: false },
};

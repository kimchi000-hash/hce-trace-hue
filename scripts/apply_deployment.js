// scripts/apply_deployment.js <mang> [duong-dan-html]
// Doc deployments/<mang>.json va dat CONFIG.CONTRACT_ADDRESS (va CHAIN_ID) trong web/index.html. Khong dong vao phan nao khac.
const fs = require("fs");
const path = require("path");

function apply(deploymentFile, htmlFile) {
  const d = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  if (!/^0x[0-9a-fA-F]{40}$/.test(d.core && d.core.address) || !Number.isInteger(d.chainId)) throw new Error("File deployment khong hop le: " + deploymentFile);
  let html = fs.readFileSync(htmlFile, "utf8");
  const a = /(CONTRACT_ADDRESS:\s*")[^"]*(")/, c = /(CHAIN_ID:\s*)\d+(,)/;
  if (!a.test(html) || !c.test(html)) throw new Error("Khong tim thay CONTRACT_ADDRESS / CHAIN_ID trong CONFIG cua " + htmlFile);
  html = html.replace(a, "$1" + d.core.address + "$2").replace(c, "$1" + d.chainId + "$2");
  fs.writeFileSync(htmlFile, html);
  return d;
}

module.exports = { apply };

if (require.main === module) {
  const net = process.argv[2];
  if (!net) { console.error("Dung: node scripts/apply_deployment.js sepolia"); process.exit(1); }
  const root = path.join(__dirname, "..");
  try {
    const d = apply(path.join(root, "deployments", net + ".json"), process.argv[3] || path.join(root, "web", "index.html"));
    console.log("Da dat CONTRACT_ADDRESS = " + d.core.address + ", CHAIN_ID = " + d.chainId + " trong web/index.html");
  } catch (e) { console.error("LOI: " + e.message); process.exit(1); }
}

# Giai đoạn 6: Triển khai VoteChain v2 lên Sepolia (PowerShell, Windows)

Hai hợp đồng được triển khai **bằng máy của bạn**, với ví riêng chỉ dùng để thử. Tôi (Claude) không bao giờ cần và không được nhận khóa bí mật của bạn.

> Runbook cũ `SEPOLIA_RUNBOOK.md` mô tả mô hình **một** hợp đồng (v1). Từ v2 dùng tài liệu này.

## 0. Chuẩn bị (một lần)

1. **Ví thử nghiệm riêng.** Tạo tài khoản MetaMask **mới**, đặt tên "VoteChain-test". Không dùng ví có tiền thật. Ví này sẽ là **quản trị nền tảng**: xác minh hoặc tạm ngưng tổ chức.
2. **ETH Sepolia**: nhận từ faucet (cần ít nhất **0,02 ETH**; script từ chối chạy nếu thiếu).
3. **RPC URL Sepolia**: tạo app miễn phí trên Alchemy hoặc Infura, chọn mạng Sepolia, chép URL HTTPS. URL có chứa khóa API nên **coi là bí mật**.
4. **Khóa riêng của ví thử**: MetaMask → ba chấm → Chi tiết tài khoản → Hiển thị khóa riêng tư (dạng `0x` + 64 ký tự). Chỉ chép vào file `.env` ở bước 1. **Không dán vào chat, không chụp màn hình, không đưa vào Git.**

## 1. Tạo file `.env` trên máy bạn

Trong thư mục dự án (nơi có `package.json`):
```powershell
git check-ignore .env      # phải in ra ".env" (nghĩa là Git sẽ KHÔNG bao giờ commit file này)
notepad .env
```
Dán đúng hai dòng (thay giá trị thật), lưu, đóng:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/xxxxxxxx
PRIVATE_KEY=0x................................................................
```
Nếu `git check-ignore .env` không in gì, **dừng lại** và báo tôi.

## 2. Cài và kiểm tra

```powershell
npm install
npx.cmd hardhat compile
npx.cmd hardhat test test/Deploy.test.js
```
Test phải đạt hết (6/6). Chưa cần ETH ở bước này.

## 3. Tập luyện không tốn ETH (khuyến nghị)

Mở một cửa sổ PowerShell khác chạy `npx.cmd hardhat node`, rồi ở cửa sổ này:
```powershell
npx.cmd hardhat run scripts/deploy_sepolia.js --network localhost
npx.cmd hardhat run scripts/check_deployment.js --network localhost
```
Phải thấy các dòng `PASS`. File tạo ra (`deployments/localhost.json`) đã nằm trong `.gitignore`. Chạy lại lần hai phải bị chặn với thông báo "Đã có ... deploy rồi": đó là bảo vệ chống deploy nhầm lần 2.

## 4. Triển khai thật lên Sepolia

```powershell
npx.cmd hardhat run scripts/deploy_sepolia.js --network sepolia
```
Script kiểm tra: đúng chainId 11155111, đủ số dư, deploy `OrganizationRegistry` rồi `ProjectCore(registry)`, chờ 2 xác nhận, tự đối chiếu trên chuỗi (hai hợp đồng có mã, `ProjectCore.registry()` trỏ đúng, ví của bạn là quản trị nền tảng), rồi ghi `deployments/sepolia.json` (chỉ có địa chỉ, mã giao dịch, số khối: công khai, **được phép commit**). Cuối cùng nó in sẵn các giá trị cần cho bước 5.

Kiểm tra lại bất kỳ lúc nào (chỉ đọc):
```powershell
npx.cmd hardhat run scripts/check_deployment.js --network sepolia
```
**Nếu deploy báo lỗi giữa chừng**, đừng chạy lại ngay: xem Etherscan của ví để biết hợp đồng nào đã lên chuỗi rồi gửi tôi thông báo lỗi.

## 5. Nối giao diện và Supabase

**5a. Giao diện.**
```powershell
node scripts/apply_deployment.js sepolia
```
Lệnh này chỉ đổi `CONTRACT_ADDRESS` và `CHAIN_ID` trong `web/index.html` (có test).

**5b. `chain-sync`.** Mở `supabase/.env.functions` (file không commit), thêm bốn dòng với giá trị script đã in:
```
REGISTRY_ADDRESS=0x...
CORE_ADDRESS=0x...
DEPLOY_BLOCK=<số khối>
RPC_URL=<cùng RPC URL ở .env>
```
Chạy lại lệnh đặt secrets (như Phần C, bước secrets):
```powershell
npx.cmd supabase@latest secrets set --env-file supabase/.env.functions --project-ref vfzuniykinaivchhuiul
```
`DEPLOY_BLOCK` là khối của hợp đồng deploy **sớm nhất** (Registry), để không bỏ sót sự kiện đăng ký tổ chức.

**5c. Thử đồng bộ** (đọc `SYNC_SECRET` từ file mà không in ra màn hình):
```powershell
$s = ((Select-String -Path supabase/.env.functions -Pattern '^SYNC_SECRET=').Line -split '=',2)[1].Trim()
Invoke-RestMethod -Method Post -Uri "https://vfzuniykinaivchhuiul.supabase.co/functions/v1/chain-sync" -Headers @{ "x-sync-secret" = $s } -ContentType "application/json" -Body '{}'
```
Kết quả đúng: `ok: True` kèm `head` (khối mới nhất), `organizations`, `elections`, `events` (lúc này là 0, 0, 0), **không** còn `503`. Nếu chạy hai lần trong 15 giây, lần sau trả `skipped: True` (giới hạn tần suất), đó là bình thường. Nếu lỗi `401`: sai `SYNC_SECRET`. Nếu `500`: xem Logs của hàm trong Dashboard.

**5d. Cron mỗi 1 phút.** Dashboard → Integrations → Cron → tạo job loại gọi HTTP/Edge Function tới `.../functions/v1/chain-sync`, phương thức POST, header `x-sync-secret` = giá trị `SYNC_SECRET`. Secret này nằm trong cấu hình job mà quản trị dự án xem được; chỉ đặt ở dự án của nhóm.

## 6. Thử trọn vòng bằng giao diện (đây là bằng chứng nộp)

```powershell
python -m http.server 8080 --directory web
```
Mở `http://localhost:8080` (**phải đúng domain này**, trùng `SITE_DOMAIN`), kết nối MetaMask trên Sepolia. Cần 4 ví thử: A (quản trị nền tảng, chính là ví deploy), B (Manager tổ chức), C và D (người duyệt), thêm vài ví cử tri.

| Bước | Ví | Việc | Kết quả mong đợi |
| :-: | :-: | :-- | :-- |
| 1 | B | Tổ chức → Đăng ký tổ chức | Trạng thái "Chờ xác minh" |
| 2 | A | Tổ chức → chi tiết → Xác minh | "Đã xác minh" |
| 3 | B | Thêm C, D (và ví khác) làm thành viên rồi thêm C, D làm người duyệt | Ngưỡng ký = 2 |
| 4 | bất kỳ | Chờ ≤ 1 phút | Tổ chức xuất hiện trong Supabase (khung "Thông tin hiển thị" báo "Đã đồng bộ") |
| 5 | B | Nút Đăng nhập dữ liệu, rồi Tạo cuộc bầu cử (kèm ảnh bìa) | Giao dịch thành công, ảnh và bản nháp lưu lên Supabase |
| 6 | C, D | Phê duyệt → Ký duyệt | Đủ ngưỡng thì cuộc bầu cử kích hoạt |
| 7 | bất kỳ | Phê duyệt → Đối chiếu | "Khớp hash trên chuỗi" (sau lần đồng bộ kế tiếp) |
| 8 | cử tri | Bỏ phiếu (commit, rồi reveal) | Kết quả hợp lệ |

Bước 5 và 7 là lần **đầu tiên** giao diện nói chuyện với Supabase thật: nếu gặp lỗi (CORS, đăng nhập, tải ảnh), chép nguyên thông báo gửi tôi. Cũng nhân dịp này làm Phần G (thử Storage thật) trong `SUPABASE_SETUP.md`.

## 7. Xác minh mã nguồn trên Etherscan (tùy chọn)

Đặt `ETHERSCAN_API_KEY=...` trong `.env`, rồi:
```powershell
npx.cmd hardhat verify --network sepolia <REGISTRY_ADDRESS>
npx.cmd hardhat verify --network sepolia <CORE_ADDRESS> <REGISTRY_ADDRESS>
```

## 8. Sau khi xong

- Commit `deployments/sepolia.json`, `web/index.html` (đã có địa chỉ) và `.env.example` nếu bạn điền `REGISTRY_ADDRESS`/`CORE_ADDRESS` (đều là thông tin công khai). **Không** commit `.env` hay `supabase/.env.functions`.
- Điền địa chỉ hợp đồng và mã giao dịch thật vào README và hồ sơ nộp. **Không điền địa chỉ hay mã giao dịch chưa từng xảy ra.**
- Nếu ví deploy từng bị lộ hoặc nghi ngờ: tạo ví mới, deploy lại bằng `FORCE_REDEPLOY=1`, rồi cập nhật bước 5.

## 9. Thẻ cử tri (VoterCardSBT) — tùy chọn, làm sau khi đã deploy ProjectCore

`VoterCardSBT` là hợp đồng riêng; **không sửa `ProjectCore`**. Hợp đồng kiểm tra điều kiện bằng `ProjectCore.hasRevealed`, mỗi ví một thẻ cho mỗi cuộc bầu cử, thẻ không chuyển nhượng và không ghi lựa chọn.

**Chuẩn bị ảnh mascot (một lần):** đưa thư mục chỉ chứa `0.png` … `7.png` lên IPFS (Pinata, chọn *Folder*, mạng *Public*), lấy CID của thư mục và mở thử `https://ipfs.io/ipfs/<CID>/0.png`. Không upload lại thư mục (CID sẽ đổi). Có sẵn bản dự phòng ở `web/mascots/`.

**Triển khai trên Remix** (compiler 0.8.20, không import, cùng cách với hai hợp đồng kia):

| Tham số | Giá trị |
| :-- | :-- |
| `projectCore_` | địa chỉ ProjectCore đã deploy |
| `avatarBaseURI_` | `ipfs://<CID>/` (có dấu `/` cuối). Để trống `""` nếu muốn dùng emoji dự phòng |
| `avatarCount_` | `8` (bị bỏ qua khi để trống baseURI) |
| `avatarExt_` | `png` |

Ba giá trị mascot **không đổi được sau khi deploy**; muốn đổi phải deploy lại, và các thẻ đã cấp ở bản cũ không chuyển sang bản mới.

**Nối vào giao diện:** mở trang, vào mục *Thẻ cử tri*, dán địa chỉ VoterCardSBT, bấm *Lưu địa chỉ*. Giao diện chỉ chấp nhận hợp đồng thẻ trỏ đúng tới ProjectCore đang dùng. Muốn điền sẵn cho mọi người: sửa `CONFIG.SBT_ADDRESS` trong `web/index.html` (địa chỉ công khai).

**Quyền riêng tư:** thẻ gắn công khai địa chỉ ví với cuộc bầu cử và không thể xóa. Giao diện bắt người dùng tích đồng ý trước khi nhận. Lưu ý sự kiện `Revealed` của ProjectCore vốn đã công khai lựa chọn của từng ví sau khi mở phiếu; thẻ không thêm thông tin đó nhưng làm việc tham gia dễ thấy hơn.

**Kiểm thử:** `npx.cmd hardhat test test/VoterCardSBT.test.js`. Kiểm thử giao diện thẻ: `node scripts/e2e/card_ui.js` (cần Hardhat node và máy chủ tĩnh, xem đầu file). Chưa thử trên Sepolia/MetaMask thật.

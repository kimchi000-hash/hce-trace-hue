# VoteChain — Bầu cử kín Commit–Reveal cho lớp / CLB (ECO2432)

**Một câu:** ban cán sự được bầu bằng phiếu kín trên blockchain: không ai thấy bạn bầu ai trước khi bạn tự mở phiếu, mỗi ví một phiếu, và kết quả chỉ hợp lệ khi đủ tỷ lệ tham gia và có đúng một người dẫn đầu.

- **Học phần:** ECO2432 — Tiền điện tử & Hợp đồng thông minh (ĐH Kinh tế Huế)
- **Thành viên:** Nguyễn Thị Kim Chi (23K4300025) · Võ Thị Thư (23K4300038)
- **Mạng:** Ethereum Sepolia (testnet, không mất tiền thật)
- **Hợp đồng:** [`contracts/project/ProjectCore.sol`](contracts/project/ProjectCore.sol) (Solidity 0.8.20, 313 dòng, không phụ thuộc thư viện ngoài)
- **DApp:** [`web/`](web/) (**một file duy nhất** [`web/index.html`](web/index.html): HTML + CSS + JS + ABI nội tuyến, chỉ nạp ethers.js v6 từ CDN) · **URL GitHub Pages:** _chưa công bố — điền sau Lab 15_

---

## 1. Bài toán và người dùng

| | |
| :--- | :--- |
| **Người dùng** | Sinh viên lớp/CLB (cử tri), ban cán sự hoặc giảng viên (ban tổ chức, người duyệt) |
| **Nỗi đau** | Bầu giấy khó kiểm; bầu on-chain thông thường lộ số phiếu theo thời gian thực nên sinh viên bầu sau bị ảnh hưởng đám đông và áp lực xã hội |
| **Giải pháp** | Pha 1 chỉ nộp mã băm của phiếu; pha 2 mới mở phiếu. Danh sách cử tri là Merkle root; cuộc bầu cử cần đủ chữ ký người duyệt mới hoạt động |
| **Vì sao không dùng bảng tính** | Mã băm gắn ví và cuộc bầu cử chống chép phiếu; mốc thời gian, quorum và kết quả tự thực thi, không ai (kể cả nhóm) đổi được sau khi tạo |

## 2. Luồng sử dụng

1. **Ban tổ chức** dựng danh sách ví → `node scripts/merkle.js voters.json web/proofs.json` ra `merkleRoot` và bằng chứng từng ví → `createElection(...)`.
2. **Người duyệt** gọi `approveElection(id)` trong pha Đăng ký. Đủ chữ ký thì cuộc bầu cử kích hoạt.
3. **Pha Commit:** cử tri chọn ứng viên trên web; trình duyệt sinh `salt`, tính `commitment`, gửi lên cùng bằng chứng Merkle; tự tải file dự phòng `.json`.
4. **Pha Reveal:** cử tri bấm "Tiết lộ phiếu"; hợp đồng đối chiếu băm rồi cộng phiếu.
5. **Kết thúc:** `result(id)` trả `(valid, winnerId, topVotes)`. Hòa hoặc thiếu quorum → `valid = false`.

Chi tiết quy tắc: [`docs/SPEC.md`](docs/SPEC.md) · Kinh tế, gas, rủi ro người dùng: [`docs/ECONOMIC_RULES.md`](docs/ECONOMIC_RULES.md) · Tự rà soát an ninh: [`docs/SELF_AUDIT.md`](docs/SELF_AUDIT.md) · Đo gas: [`docs/GAS_REPORT.md`](docs/GAS_REPORT.md)

## 3. Bảng ánh xạ giao diện ↔ hợp đồng (Lab 15)

| Thành phần | Giá trị của nhóm |
| :--- | :--- |
| Địa chỉ contract (Sepolia) | _điền sau khi triển khai bản mới_ → dán vào ô “Địa chỉ hợp đồng” trên trang (được nhớ lại), hoặc điền `CONFIG.CONTRACT_ADDRESS` ở đầu script trong [`web/index.html`](web/index.html), hoặc dùng đường dẫn `?contract=0x…` |
| ABI lấy từ | khối `ABI-START … ABI-END` trong [`web/index.html`](web/index.html); `test/web_abi.test.js` đối chiếu tự động với bản biên dịch của `ProjectCore.sol` |
| Hàm đọc, không tốn phí | `electionCount`, `phase`, `getElectionBasicInfo`, `getElectionStats`, `getCandidates`, `getVotes`, `getVoterStatus`, `commitments`, `result` |
| Hàm ghi, cần ký ví | `commit(id, commitment, merkleProof)`, `reveal(id, candidateId, salt)` (người duyệt: `approveElection`; ban tổ chức: `createElection`) |
| Mạng yêu cầu | Sepolia, chainId 11155111; sai mạng thì giao diện yêu cầu chuyển |

> Địa chỉ cũ `0x7D3bC21A8532d2011cF970C0701413C236C53Ddd` là bản triển khai Lab 11 với **hợp đồng cũ** (một cuộc bầu cử, `registerVoters`). Mã hiện tại có ABI khác nên **không dùng địa chỉ đó với giao diện mới**; cần triển khai lại theo [`docs/SEPOLIA_RUNBOOK.md`](docs/SEPOLIA_RUNBOOK.md).

### Giao diện `web/index.html` (một file, bố cục Web3 Governance)

Thương hiệu VoteChain, nền sáng, sidebar trái + topbar. Mọi số liệu đọc trực tiếp từ hợp đồng (không dữ liệu giả).

| Màn hình | Nội dung |
| :--- | :--- |
| **Dashboard** | Hero giới thiệu (Commit–Reveal, trạng thái mạng), KPI, lưới card cuộc bầu cử (ảnh bìa minh họa, trạng thái Sắp diễn ra / Đang diễn ra / Đã kết thúc, thời gian, số ứng viên, tiến độ tham gia), lịch sử các cuộc đã kết thúc (số phiếu hợp lệ, kết quả), hoạt động gần đây, kết nối hợp đồng. Chưa có dữ liệu thì hiện empty state hướng dẫn cấu hình hợp đồng / tạo cuộc |
| **Bầu cử** | Danh sách card, lọc theo trạng thái, tìm kiếm |
| **Chi tiết cuộc bầu cử** | Thông tin, mục đích, thời gian, timeline 6 giai đoạn (khởi tạo, phê duyệt, xác thực cử tri, commit, reveal, kết quả), hồ sơ ứng viên (bấm để xem đầy đủ), số liệu tổng hợp ẩn danh (đủ điều kiện / đã xác thực / đã tham gia / tỷ lệ, hoàn thành Commit và Reveal) |
| **Bỏ phiếu** | Stepper 4 bước (xác thực điều kiện, chọn ứng viên, Commit, Reveal), danh sách điều kiện, salt và sao lưu/khôi phục |
| **Tạo cuộc bầu cử** | 4 nhóm thông tin, kiểm tra từng giới hạn của hợp đồng, dựng Merkle root và tải `proofs.json` |
| **Phê duyệt** | Bảng cuộc chờ duyệt (người tạo, chữ ký x/y, hạn), ký trực tiếp từ bảng |
| **Kết quả** | KPI, biểu đồ cột và donut, lý do hợp lệ / thiếu quorum / hòa |
| **Nhật ký hoạt động** | Sự kiện theo loại, ví, mã giao dịch (liên kết Etherscan), bảng giao dịch phiên |
| **Công cụ, Giới thiệu** | Kiểm tra Merkle proof, máy tính mã cam kết, quy tắc và giới hạn đã biết |

**Nguồn dữ liệu được gắn nhãn rõ.** `On-chain · đã xác thực`: tên cuộc bầu cử, tên và số thứ tự ứng viên, mốc thời gian, số cử tri khai báo, số phiếu, chữ ký duyệt, kết quả. `Off-chain · chưa xác minh`: mô tả, mục đích, ảnh, chức danh, tiểu sử, quá trình hoạt động, chương trình hành động. Hợp đồng không đổi; phần off-chain được soạn ngay trong trang (lưu `localStorage` theo mạng và hợp đồng, ảnh được thu về 256 px), hoặc công bố bằng file `web/meta.json` (xuất/nhập từ nút ngay trong trang, định dạng `{ "elections": { "0": { "description", "purpose", "candidates": [ { "title", "bio", "history", "program", "photo" } ] } } }`). Bản soạn trên trình duyệt ghi đè file theo từng trường. Mọi chuỗi được hiển thị bằng `textContent`; ảnh chỉ nhận `data:image/` đã thu nhỏ hoặc URL `https`.

**Quyền riêng tư.** Giao diện không có danh sách cử tri và không hiển thị ví hay lựa chọn của từng cử tri ở feed, nhật ký, trang chi tiết; chỉ có số liệu tổng hợp. Lưu ý dữ liệu thô trên chuỗi vẫn công khai (ai cũng đọc được qua Etherscan), giao diện chỉ không làm nổi bật nó. "Đã xác thực" = số sự kiện `Committed` trong khoảng block đã quét; nếu không quét tới lúc tạo cuộc, giao diện ghi "≥ n".

Lỗi hợp đồng được dịch sang tiếng Việt (Lab 15). ABI, công thức commitment và logic ví giữ nguyên; `test/web_abi.test.js` vẫn đối chiếu ABI trong file với bản biên dịch.

## 4. Chạy thử trên máy

```bash
npm install
npx hardhat test          # 77 ca: luồng đúng, biên, gian lận, Merkle, khớp ABI giao diện
npm run gas               # bảng gas (xem docs/GAS_REPORT.md)
npm run merkle            # dựng cây Merkle từ scripts/voters.example.json -> web/proofs.json
npm run web               # mở http://localhost:8080 (cần MetaMask)
```

Triển khai thật trên Sepolia, từng bước và danh sách bằng chứng cần thu: [`docs/SEPOLIA_RUNBOOK.md`](docs/SEPOLIA_RUNBOOK.md).

## 5. Kết quả kiểm thử và đo lường

| Hạng mục | Kết quả |
| :--- | :--- |
| Test hợp đồng + Merkle + ABI | 77 ca xanh (`npx hardhat test`) |
| Chạy thử đầu cuối giao diện (trình duyệt tự động, Hardhat cục bộ) | 15 bước xanh (desktop và mobile): sai pha, commit, nộp lần hai, ví ngoài danh sách, reveal, reveal lần hai, kết quả sớm và kết quả cuối |
| Gas (500 cử tri) | `commit` ≈ 68 650 · `reveal` 89 927 / 55 727 · `createElection` 593 264 · triển khai 2 619 144 |
| Tối ưu | `reveal` giảm ≈ 18–26% nhờ bỏ một mapping (xem `docs/GAS_REPORT.md`) |

## 6. Phạm vi, giới hạn đã biết

- Hợp đồng 313 dòng (vượt mốc 150 dòng của bộ lọc phạm vi; nhóm đã xin điều chỉnh, xem [`docs/GATE_REVIEW_1.md`](docs/GATE_REVIEW_1.md) phụ lục).
- `voterCount` do ban tổ chức tự khai; người duyệt là chốt kiểm tra. Người duyệt là ví giả thì chữ ký vô nghĩa. Bí mật chỉ đến lúc cử tri tự mở phiếu. Chi tiết: [`docs/SELF_AUDIT.md`](docs/SELF_AUDIT.md) (TB1–TB5).
- Sản phẩm phục vụ học tập, chưa được kiểm toán chuyên nghiệp.

---

## 7. Tiến độ các bài Lab

| Lab | Sản phẩm | Tệp | Trạng thái |
| :-: | :--- | :--- | :---: |
| 08 | Kế hoạch, đặc tả, quy tắc kinh tế | [`PROJECT_PLAN`](docs/PROJECT_PLAN.md), [`SPEC`](docs/SPEC.md), [`ECONOMIC_RULES`](docs/ECONOMIC_RULES.md) | ✅ (đã cập nhật v3.0) |
| 09 | Hợp đồng lõi, nhật ký AI, đo gas | [`ProjectCore.sol`](contracts/project/ProjectCore.sol), [`AI_JOURNAL`](docs/AI_JOURNAL.md), [`evidence/lab-09`](evidence/lab-09/) | ✅ |
| 10 | Audit mã do AI sinh, vá lỗi | [`AI_JOURNAL`](docs/AI_JOURNAL.md), [`evidence/lab-10`](evidence/lab-10/) | ✅ |
| 11 | Commit–Reveal + quorum, thử trên Sepolia | [`evidence/lab-11`](evidence/lab-11/) | ✅ (bản hợp đồng cũ; cần bản chạy đủ vòng cho hợp đồng mới) |
| 12 | Gate Review 1, khóa phạm vi | [`GATE_REVIEW_1`](docs/GATE_REVIEW_1.md), [`evidence/lab-12`](evidence/lab-12/) | ✅ (có phụ lục điều chỉnh) |
| 13 | Reentrancy (VulnerableBank), test phân quyền | [`evidence/lab-13`](evidence/lab-13/), [`test/`](test/) | ✅ |
| 14 | Rà soát chéo | [`AUDIT_REPORT`](docs/AUDIT_REPORT.md) (báo cáo về hợp đồng của nhóm VotaChain; xem ghi chú đầu tệp), [`SELF_AUDIT`](docs/SELF_AUDIT.md) | 🔄 chờ báo cáo từ nhóm bạn |
| 15 | DApp công khai + kế hoạch trình bày | [`web/`](web/), [`PRESENTATION_PLAN`](docs/PRESENTATION_PLAN.md) | 🔄 mã xong; chờ triển khai Sepolia và GitHub Pages |
| 17 | Bộ test (≥ 3 ca, có gian lận), đo gas | [`test/`](test/), [`GAS_REPORT`](docs/GAS_REPORT.md) | ✅ |
| 19–21 | Poster A2, video 90 giây, demo trực tiếp, vấn đáp | [`PRESENTATION_PLAN`](docs/PRESENTATION_PLAN.md) | ⏳ |

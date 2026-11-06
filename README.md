# VoteChain — Bầu cử kín Commit–Reveal nhiều tổ chức cho lớp / CLB (ECO2432)

**Một câu:** ban cán sự được bầu bằng phiếu kín trên blockchain: không ai thấy bạn bầu ai trước khi bạn tự mở phiếu, mỗi ví một phiếu, kết quả chỉ hợp lệ khi đủ tỷ lệ tham gia và có đúng một người dẫn đầu, và mọi hồ sơ ứng viên đều đối chiếu được với hash trên chuỗi.

- **Học phần:** ECO2432 — Tiền điện tử & Hợp đồng thông minh (ĐH Kinh tế Huế)
- **Thành viên:** Nguyễn Thị Kim Chi (23K4300025) · Võ Thị Thư (23K4300038)
- **Mạng:** Ethereum Sepolia (testnet, không mất tiền thật)
- **Ba hợp đồng** (Solidity 0.8.20, không phụ thuộc thư viện ngoài):
  - [`ProjectCore.sol`](contracts/project/ProjectCore.sol) (585 dòng): cuộc bầu cử, Commit–Reveal, Merkle, quorum, kết quả, hàng chờ duyệt, hash hồ sơ.
  - [`OrganizationRegistry.sol`](contracts/project/OrganizationRegistry.sol) (278 dòng): tổ chức, xác minh, thành viên và vai trò, đại diện duyệt, ngưỡng 2/3.
  - [`VoterCardSBT.sol`](contracts/project/VoterCardSBT.sol) (314 dòng): thẻ cử tri soulbound (không chuyển nhượng), 12 linh vật.
- **DApp:** [`web/`](web/) (**một file duy nhất** [`web/index.html`](web/index.html): HTML + CSS + JS + ABI nội tuyến, chỉ nạp ethers.js v6 từ CDN).
- **Địa chỉ web công khai:** _sẽ điền sau khi đưa lên Vercel_
- **Dữ liệu ngoài chuỗi:** Supabase (hồ sơ tổ chức, cuộc bầu cử, ứng viên; đăng nhập bằng ví). Chuỗi chỉ giữ hash, trình duyệt băm lại nội dung để đối chiếu.

---

## 1. Bài toán và người dùng

| | |
| :--- | :--- |
| **Người dùng** | Sinh viên lớp/CLB (cử tri), ban cán sự hoặc giảng viên (ban tổ chức, đại diện duyệt), quản trị nền tảng |
| **Nỗi đau** | Bầu giấy khó kiểm; bầu on-chain thông thường lộ số phiếu theo thời gian thực nên sinh viên bầu sau bị ảnh hưởng đám đông và áp lực xã hội |
| **Giải pháp** | Pha 1 chỉ nộp mã băm của phiếu; pha 2 mới mở phiếu. Danh sách cử tri là Merkle root; mỗi tổ chức có nhóm đại diện duyệt riêng và cuộc bầu cử chỉ hoạt động khi đủ chữ ký |
| **Vì sao không dùng bảng tính** | Mã băm gắn ví và cuộc bầu cử chống chép phiếu; mốc thời gian, quorum và kết quả tự thực thi, không ai (kể cả nhóm) đổi được sau khi tạo; hồ sơ ứng viên bị sửa là phát hiện được |

## 2. Luồng sử dụng

1. **Tổ chức:** chủ tổ chức đăng ký (`registerOrganization`, kèm hash hồ sơ); quản trị nền tảng xác minh; Manager thêm thành viên, đặt Proposer và 2–10 đại diện duyệt.
2. **Tạo cuộc bầu cử:** Proposer/Manager dựng danh sách ví → `node scripts/merkle.js voters.json web/proofs.json` ra `merkleRoot` và bằng chứng từng ví → `createElection(...)` (kèm hash hồ sơ cuộc và từng ứng viên). Nhóm duyệt được chụp từ tổ chức; người tạo và ví ứng viên khai báo bị loại.
3. **Duyệt:** các đại diện gọi `approveElection(id)` trong pha Đăng ký. Đủ ngưỡng `⌈2n/3⌉` thì cuộc bầu cử kích hoạt. Sửa hồ sơ trong pha này sẽ xóa chữ ký và phải duyệt lại.
4. **Pha Commit:** cử tri chọn ứng viên (xem ảnh và hồ sơ đã xác thực hash); trình duyệt sinh `salt`, tính `commitment`, gửi lên cùng bằng chứng Merkle; tự tải file dự phòng `.json`.
5. **Pha Reveal:** cử tri bấm "Tiết lộ phiếu"; hợp đồng đối chiếu băm rồi cộng phiếu. Sau đó có thể nhận **thẻ cử tri** (tải ảnh hoặc chia sẻ).
6. **Kết thúc:** `result(id)` trả `(valid, winnerId, topVotes)`. Hòa hoặc thiếu quorum → `valid = false`.

Chi tiết quy tắc: [`docs/SPEC.md`](docs/SPEC.md) · Kinh tế, gas, rủi ro người dùng: [`docs/ECONOMIC_RULES.md`](docs/ECONOMIC_RULES.md) · Kiến trúc nhiều tổ chức: [`docs/ARCHITECTURE_V2.md`](docs/ARCHITECTURE_V2.md) · Tự rà soát an ninh: [`docs/SELF_AUDIT.md`](docs/SELF_AUDIT.md) · Đo gas: [`docs/GAS_REPORT.md`](docs/GAS_REPORT.md) · Bản đồ hàm (luyện vấn đáp): [`docs/FUNCTION_MAP.md`](docs/FUNCTION_MAP.md)

## 3. Địa chỉ trên Sepolia và ánh xạ giao diện ↔ hợp đồng

| Thành phần | Giá trị (nguồn: [`deployments/sepolia.json`](deployments/sepolia.json)) |
| :--- | :--- |
| `OrganizationRegistry` | [`0x1790495d1FD4c2d630298a492d58A309b23De811`](https://sepolia.etherscan.io/address/0x1790495d1FD4c2d630298a492d58A309b23De811) (khối 12 070 353) |
| `ProjectCore` | [`0x7f5ab140bf0118aA263A82de9e6eb02a56f474a5`](https://sepolia.etherscan.io/address/0x7f5ab140bf0118aA263A82de9e6eb02a56f474a5) |
| `VoterCardSBT` | [`0xa7071ABD96B1299330078099d30B061BC7A93DDa`](https://sepolia.etherscan.io/address/0xa7071ABD96B1299330078099d30B061BC7A93DDa) (12 linh vật, ảnh trên IPFS) |
| ABI lấy từ | khối `ABI-START … ABI-END` trong [`web/index.html`](web/index.html); `test/web_abi.test.js` đối chiếu tự động với bản biên dịch của ba hợp đồng |
| Hàm đọc, không tốn phí | `electionCount`, `phase`, `requestStatus`, `getElectionBasicInfo`, `getElectionStats`, `getElectionOrg`, `getCandidates`, `getVotes`, `getCandidateMetadata`, `getVoterStatus`, `result`; của Registry: `getOrganization`, `getMembers`, `getApprovers` |
| Hàm ghi, cần ký ví | `createElection`, `approveElection`, `rejectElection`, `withdrawElection`, `updateElectionMetadata`, `updateCandidateMetadata`, `commit`, `reveal`, `mint` (thẻ); của Registry: `registerOrganization`, `updateOrganization`, `addMember`, `addApprover` |
| Mạng yêu cầu | Sepolia, chainId 11155111; sai mạng thì giao diện yêu cầu chuyển |

> Các địa chỉ cũ (`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`, bản Lab 11 một cuộc bầu cử; và thẻ cử tri 8 linh vật trước đó) đã bỏ. Mã hiện tại có ABI khác nên **không dùng địa chỉ cũ với giao diện mới**. Quy trình triển khai: [`docs/SEPOLIA_DEPLOY_V2.md`](docs/SEPOLIA_DEPLOY_V2.md).

### Giao diện `web/index.html` (một file, bố cục Web3 Governance)

Thương hiệu VoteChain, nền sáng, sidebar trái + topbar + chân trang có liên hệ quản trị. Số liệu đọc trực tiếp từ hợp đồng; nội dung hồ sơ đọc từ Supabase và chỉ hiển thị khi băm lại khớp hash trên chuỗi.

| Màn hình | Nội dung |
| :--- | :--- |
| **Dashboard** | Hero giới thiệu, KPI, lưới card cuộc bầu cử (trạng thái Sắp diễn ra / Đang diễn ra / Đã kết thúc, thời gian, tiến độ), hoạt động gần đây, kết nối hợp đồng |
| **Bầu cử** | Danh sách card, lọc theo trạng thái, tìm kiếm |
| **Chi tiết cuộc bầu cử** | Thông tin, mục đích, timeline 6 giai đoạn, hồ sơ ứng viên (ảnh, tiểu sử, nhãn "Đã xác thực hash"), **biểu đồ** kết quả và tham gia (vòng tròn, cột), khung cập nhật hồ sơ dành riêng cho người tạo (chỉ pha Đăng ký) |
| **Tổ chức** | Đăng ký tổ chức (loại, giới thiệu, đơn vị chủ quản, năm thành lập, email, website), thẻ "Hồ sơ tổ chức" đối chiếu hash, chỉnh sửa hồ sơ (Manager), thành viên, đại diện duyệt, logo |
| **Bỏ phiếu** | Stepper 4 bước (xác thực điều kiện, chọn ứng viên có ảnh và tiểu sử, Commit, Reveal), salt và sao lưu/khôi phục |
| **Thẻ cử tri** | Nhận thẻ soulbound sau khi mở phiếu, bộ sưu tập, tải ảnh thẻ (PNG), chia sẻ |
| **Tạo cuộc bầu cử** | Chọn tổ chức, ứng viên (tên, ví tùy chọn, hồ sơ, ảnh), **phạm vi xem** (thông tin / hồ sơ ứng viên / kết quả: công khai, nội bộ, hạn chế), chọn mốc giờ hoặc số phút, kiểm tra từng giới hạn của hợp đồng, dựng Merkle root và tải `proofs.json` |
| **Phê duyệt** | Bảng cuộc chờ duyệt, thẻ ứng viên của cuộc đang chọn, đối chiếu hash nội dung, ký hoặc từ chối |
| **Kết quả** | KPI, biểu đồ cột và donut, lý do hợp lệ / thiếu quorum / hòa |
| **Nhật ký hoạt động** | Sự kiện theo loại, ví, mã giao dịch (liên kết Etherscan), bảng giao dịch phiên |
| **Công cụ, Giới thiệu** | Kiểm tra Merkle proof, máy tính mã cam kết, quy tắc và giới hạn đã biết |

**Nguồn dữ liệu.** Trên chuỗi: tên cuộc bầu cử, tên và số thứ tự ứng viên, mốc thời gian, số cử tri khai báo, số phiếu, chữ ký duyệt, kết quả, **hash** hồ sơ. Ngoài chuỗi (Supabase): mô tả, mục đích, ảnh, tiểu sử, quá trình hoạt động, chương trình hành động, hồ sơ tổ chức. Giao diện băm lại nội dung bằng đúng thuật toán của hợp đồng (JSON chuẩn hóa → `keccak256`) và chỉ hiện nội dung khi khớp; sai thì báo "KHÔNG khớp hash", thiếu thì báo chưa có nội dung. Ví cử tri không sửa được hồ sơ: chỉ người tạo cuộc bầu cử ghi được, và chỉ trong pha Đăng ký. Mọi chuỗi hiển thị bằng `textContent`; ảnh chỉ nhận URL `https`.

**Quyền riêng tư.** Giao diện không có danh sách cử tri và không hiển thị ví hay lựa chọn của từng cử tri ở feed, nhật ký, trang chi tiết; chỉ có số liệu tổng hợp. Dữ liệu thô trên chuỗi vẫn công khai (ai cũng đọc được qua Etherscan), giao diện chỉ không làm nổi bật nó. Ảnh thẻ cử tri không có ví hay lựa chọn.

Lỗi hợp đồng được dịch sang tiếng Việt. ABI, công thức commitment và logic ví giữ nguyên; `test/web_abi.test.js` đối chiếu ABI trong file với bản biên dịch.

## 4. Chạy thử trên máy

```bash
npm install
npx hardhat test          # 201 ca: hợp đồng, Merkle, tổ chức, chống spam, hash hồ sơ, thẻ cử tri, khớp ABI, Edge Function
npm run test:supabase     # 82 ca: lược đồ, RLS, hàm SQL, quyền (PGlite)
npm run gas               # bảng gas (xem docs/GAS_REPORT.md)
npm run merkle            # dựng cây Merkle từ scripts/voters.example.json -> web/proofs.json
npm run web               # mở http://localhost:8080 (cần MetaMask)
```

Thiết lập Supabase: [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md). Triển khai Sepolia: [`docs/SEPOLIA_DEPLOY_V2.md`](docs/SEPOLIA_DEPLOY_V2.md).

## 5. Kết quả kiểm thử và đo lường

| Hạng mục | Kết quả |
| :--- | :--- |
| Test hợp đồng (`npx hardhat test`) | **201 ca xanh**: cuộc bầu cử (nhóm A–H: tạo, duyệt, commit, reveal, gian lận, quorum, thời gian, Merkle), tổ chức, chống spam, hash hồ sơ, thẻ cử tri, khớp ABI, triển khai, Edge Function |
| Test Supabase (`npm run test:supabase`) | **82 ca xanh**: lược đồ, chính sách RLS, hàm SQL `SECURITY DEFINER`, quyền thực thi, hồ sơ tổ chức |
| Chạy thử đầu cuối giao diện (trình duyệt tự động, Hardhat cục bộ, Supabase giả lập) | `phase5_ui` 51 (tổ chức, xác minh, thành viên, tạo cuộc có hash hồ sơ, duyệt, từ chối, rút, hết hạn, commit, reveal, kết quả, đăng nhập ví) · `meta_update_ui` 19 (cập nhật hồ sơ, hiện ứng viên ở Bỏ phiếu và Phê duyệt) · `org_profile_ui` 29 (đăng ký và chỉnh sửa hồ sơ tổ chức) · `card_ui` 32 (thẻ cử tri, tải, chia sẻ) · `viz_ui` 8 (biểu đồ) · `approve_focus_ui` 5 · `time_ui` 12 (chọn mốc giờ) · `share_ui` 12 (chia sẻ liên kết cuộc bầu cử) · `visibility_ui` 34 (phạm vi xem: tạo, ảnh riêng tư, quyền xem theo vai trò, khóa kết quả) |
| Gas (500 cử tri) | `commit` ≈ 68 630 · `reveal` 89 862 / 55 662 · `createElection` 1 011 904 · `mint` thẻ 128 245 (xem [`docs/GAS_REPORT.md`](docs/GAS_REPORT.md)) |
| Tối ưu | `reveal` giảm ≈ 18–26% nhờ bỏ một mapping (lịch sử ở `docs/GAS_REPORT.md`) |

Các test giao diện dùng Supabase **giả lập**; chưa phải số liệu từ Supabase thật. Bằng chứng giao dịch Sepolia cho bản V2: xem [`evidence/v2/README.md`](evidence/v2/README.md).

## 6. Phạm vi, giới hạn đã biết

- Ba hợp đồng tổng 1 177 dòng; `ProjectCore.sol` 585 dòng vượt mốc 150 dòng của bộ lọc phạm vi. Nhóm đã ghi rõ và xin điều chỉnh, xem phụ lục [`docs/GATE_REVIEW_1.md`](docs/GATE_REVIEW_1.md); **chưa có xác nhận của giảng viên** tính đến thời điểm viết.
- `voterCount` do ban tổ chức tự khai; nhóm duyệt là chốt kiểm tra. Đại diện là ví giả thì chữ ký vô nghĩa. Bí mật chỉ đến lúc cử tri tự mở phiếu. `candidateWallets` là tự khai và tùy chọn. Chi tiết: [`docs/SELF_AUDIT.md`](docs/SELF_AUDIT.md).
- Khâu đề cử và thu thập thông tin ứng viên diễn ra ngoài chuỗi (quy trình xã hội); chuỗi bảo vệ từ khi danh sách được chốt. Hướng phát triển: ứng viên ký xác nhận bằng ví.
- Sản phẩm phục vụ học tập, chưa được kiểm toán chuyên nghiệp.

---

## 7. Tiến độ các bài Lab

| Lab | Sản phẩm | Tệp | Trạng thái |
| :-: | :--- | :--- | :---: |
| 08 | Kế hoạch, đặc tả, quy tắc kinh tế | [`PROJECT_PLAN`](docs/PROJECT_PLAN.md), [`SPEC`](docs/SPEC.md), [`ECONOMIC_RULES`](docs/ECONOMIC_RULES.md) | ✅ (đã cập nhật v4.0) |
| 09 | Hợp đồng lõi, nhật ký AI, đo gas | [`ProjectCore.sol`](contracts/project/ProjectCore.sol), [`AI_JOURNAL`](docs/AI_JOURNAL.md), [`evidence/lab-09`](evidence/lab-09/) | ✅ |
| 10 | Audit mã do AI sinh, vá lỗi | [`AI_JOURNAL`](docs/AI_JOURNAL.md), [`evidence/lab-10`](evidence/lab-10/) | ✅ |
| 11 | Commit–Reveal + quorum, thử trên Sepolia | [`evidence/lab-11`](evidence/lab-11/) | ✅ (bản hợp đồng cũ; bằng chứng bản V2 ở [`evidence/v2`](evidence/v2/README.md)) |
| 12 | Gate Review 1, khóa phạm vi | [`GATE_REVIEW_1`](docs/GATE_REVIEW_1.md), [`evidence/lab-12`](evidence/lab-12/) | ✅ (có phụ lục điều chỉnh) |
| 13 | Reentrancy (VulnerableBank), test phân quyền | [`evidence/lab-13`](evidence/lab-13/), [`test/`](test/) | ✅ |
| 14 | Rà soát chéo | [`AUDIT_REPORT`](docs/AUDIT_REPORT.md) (báo cáo về hợp đồng của nhóm VotaChain; xem ghi chú đầu tệp), [`SELF_AUDIT`](docs/SELF_AUDIT.md) | 🔄 chờ báo cáo từ nhóm bạn |
| 15 | DApp công khai + kế hoạch trình bày | [`web/`](web/), [`PRESENTATION_PLAN`](docs/PRESENTATION_PLAN.md) | 🔄 đã triển khai Sepolia; chờ đưa lên Vercel |
| 17 | Bộ test (≥ 3 ca, có gian lận), đo gas | [`test/`](test/), [`GAS_REPORT`](docs/GAS_REPORT.md) | ✅ |
| 19–21 | Poster A2, video 90 giây, demo trực tiếp, vấn đáp | [`PRESENTATION_PLAN`](docs/PRESENTATION_PLAN.md), [`FUNCTION_MAP`](docs/FUNCTION_MAP.md) | ⏳ |

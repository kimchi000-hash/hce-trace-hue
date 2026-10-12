# ECO2432 Web3 Starter — Club Voting Project
## Hệ thống Bỏ phiếu Ban cán sự Lớp / CLB on-chain (Bầu cử kín 2 pha Commit - Reveal & Quorum)

- **Thành viên 1:** Nguyễn Thị Kim Chi — Mã SV: 23K4300025 (Smart Contract Dev / Tester)
- **Thành viên 2:** Võ Thị Thư — Mã SV: 23K4300038 (Frontend Dev / Tester)
- **Mạng triển khai thực tế:** Ethereum Sepolia Testnet
- **Địa chỉ hợp đồng trên Sepolia:** [`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`](https://sepolia.etherscan.io/address/0x7D3bC21A8532d2011cF970C0701413C236C53Ddd)

---

## 📌 Bảng theo dõi tiến độ và Nghiệm thu các bài Lab (ECO2432)

### Thông tin dự án
- **Đề tài:** Hệ thống Bỏ phiếu Ban cán sự Lớp / CLB on-chain (Club Voting) — Cơ chế Commit - Reveal & Quorum
- **Bài toán giải quyết:** Loại bỏ nguy cơ gian lận, sai lệch kết quả của bầu cử truyền thống, đồng thời triệt tiêu **hiệu ứng tâm lý đám đông (Bandwagon Effect)** và áp lực xã hội của bầu cử on-chain thông thường bằng cơ chế Mật mã học Bầu cử kín 2 pha (Commit - Reveal).
- **Đối tượng sử dụng:** Sinh viên lớp học phần ECO2432, thành viên Câu lạc bộ sinh viên, Giảng viên và Ban cán sự.

---

### Danh mục sản phẩm bàn giao (Deliverables)

| Bài Lab | Hạng mục sản phẩm | Đường dẫn tệp / Artifact kiểm tra | Người phụ trách chính | Trạng thái nghiệm thu |
| :--- | :--- | :--- | :--- | :---: |
| **Lab 08** | **Kế hoạch dự án & Phân vai** | [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | Kim Chi & Võ Thư | ✅ Đã hoàn thành |
| **Lab 08** | **Đặc tả nghiệp vụ v0.1** | [`docs/SPEC.md`](docs/SPEC.md) | Kim Chi | ✅ Đã hoàn thành |
| **Lab 08** | **Quy tắc kinh tế & Chống lạm dụng** | [`docs/ECONOMIC_RULES.md`](docs/ECONOMIC_RULES.md) | Kim Chi | ✅ Đã hoàn thành |
| **Lab 08** | **Commit khởi tạo codebase nhóm** | Commit message: `lab-08: khoi tao codebase nhom va dac ta v0.1` | Cả hai thành viên | ✅ Đã đóng dấu |
| **Lab 09** | **Hợp đồng cốt lõi sản phẩm** | [`contracts/project/ProjectCore.sol`](contracts/project/ProjectCore.sol) | Kim Chi | ✅ Biên dịch thành công (Remix 0.8.20+) |
| **Lab 09** | **Nhật ký AI & Đối soát lỗi cú pháp** | [`docs/AI_JOURNAL.md`](docs/AI_JOURNAL.md) | Kim Chi | ✅ Đã ghi nhận (sửa lỗi dòng 21) |
| **Lab 09** | **Thực nghiệm kỹ thuật & Bảng đo Gas** | [`evidence/lab-09/gas_report.md`](evidence/lab-09/gas_report.md) | Võ Thư | ✅ Đủ 3 mốc gas trên Remix VM |
| **Lab 09** | **Minh chứng chu trình TimeLockVault** | [`evidence/lab-09/`](evidence/lab-09/) (Ảnh 01–04) | Võ Thư | ✅ Đã nộp ảnh Deploy, Deposit, Withdraw |
| **Lab 09** | **Commit nghiệm thu hợp đồng** | Commit message: `lab-09: contract loi bien dich duoc` | Cả hai thành viên | ✅ Đã đóng dấu |
| **Lab 10** | **Bản vá hợp đồng cốt lõi** | [`contracts/project/ProjectCore.sol`](contracts/project/ProjectCore.sol) | Kim Chi | ✅ Đã vá lỗi mảng rỗng và candidateId (CEI, Custom Error) |
| **Lab 10** | **Nhật ký Audit & Phân định lỗi AI** | [`docs/AI_JOURNAL.md`](docs/AI_JOURNAL.md) | Kim Chi | ✅ Đủ bảng 4 lỗi (ghi rõ lỗi số 4 do Sinh viên phát hiện) |
| **Lab 10** | **Bảng phân tích & Bản vá lỗi két rút tiền** | [`contracts/training/VaultBuggy.sol`](contracts/training/VaultBuggy.sol) | Võ Thư | ✅ Đã khắc phục 4 lỗi an ninh (Reentrancy, onlyOwner, logic mốc thời gian) |
| **Lab 10** | **Bằng chứng thực nghiệm rà soát** | [`evidence/lab-10/`](evidence/lab-10/) | Võ Thư | ✅ Đã lưu ảnh minh chứng khai thác và kiểm thử Remix VM |
| **Lab 10** | **Commit nghiệm thu chốt buổi** | Commit message: `lab-10: audit va sua loi project core` | Cả hai thành viên | ✅ Đã đóng dấu |
| **Lab 11** | **Hợp đồng Bầu cử kín Commit-Reveal** | [`contracts/project/ProjectCore.sol`](contracts/project/ProjectCore.sol) | Kim Chi | ✅ Đã nâng cấp 4 pha, Quorum basis points |
| **Lab 11** | **Đặc tả & Quy tắc kinh tế V2.0** | [`docs/SPEC.md`](docs/SPEC.md), [`docs/ECONOMIC_RULES.md`](docs/ECONOMIC_RULES.md) | Kim Chi | ✅ Khớp 100% 5 quy tắc R1-R5, chống Copy-voting |
| **Lab 11** | **Minh chứng thực nghiệm Sepolia** | [`evidence/lab-11/README.md`](evidence/lab-11/README.md) | Võ Thư | ✅ Đạt 1 ca hợp lệ (Block 11899220) & 1 ca vi phạm bị revert (Block 11899237) |
| **Lab 11** | **Commit nghiệm thu kiểm thử** | Commit message: `lab-11: kiem thu thuc nghiem sepolia thanh cong` | Cả hai thành viên | ✅ Đã đóng dấu |
| **Lab 12** | **Hồ sơ Gate Review 1 (Duyệt Codebase & Khóa phạm vi)** | [`docs/GATE_REVIEW_1.md`](docs/GATE_REVIEW_1.md), [`evidence/lab-12/README.md`](evidence/lab-12/README.md) | Cả hai thành viên | ✅ ĐẠT (5/5 tiêu chí sức khỏe Repo, Đề tài Nâng cao) |
| **Lab 12** | **Cập nhật kế hoạch & Xoay vai trò Lab 13–15** | [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | Cả hai thành viên | ✅ Đã phân vai chi tiết & Khóa phạm vi sản phẩm |
| **Lab 12** | **Commit nghiệm thu Gate Review 1** | Commit message: `lab-12: thong qua gate review 1 khoa pham vi de tai` | Cả hai thành viên | ✅ Đã đóng dấu |

---

## 🏛️ Kiến trúc Hợp đồng Bầu cử Kín 4 Pha (`ProjectCore.sol`)

Hợp đồng được triển khai tại địa chỉ [`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`](https://sepolia.etherscan.io/address/0x7D3bC21A8532d2011cF970C0701413C236C53Ddd) trên Sepolia, gồm 125 dòng mã tuân thủ tuyệt đối quy ước `AGENTS.md`:
1. **Pha 0 — Registration:** Admin nạp danh sách cử tri hợp lệ (`registerVoters`, tối đa 200 ví/lô). Sau pha này, quyền thêm cử tri bị đóng băng vĩnh viễn.
2. **Pha 1 — Commit:** Cử tri nộp mã băm $\text{keccak256}(\text{candidateId}, \text{salt}, \text{msg.sender})$. Ràng buộc `msg.sender` giúp chống sao chép phiếu trong mempool (Anti Copy-Voting).
3. **Pha 2 — Reveal:** Cử tri gửi `(candidateId, salt)` để mở phiếu. Áp dụng CEI trước khi tăng biến đếm số phiếu.
4. **Pha 3 — Ended:** Hàm `result()` kiểm tra Quorum ($\text{quorumBps} = 5,000$ tương đương 50.00% theo chuẩn Basis Points) và tự động xử lý hòa phiếu (`tied > 1`).

---

## 🚀 Hướng dẫn Chạy và Tương tác Thực nghiệm

### Cách 1: Tương tác qua Remix IDE (Sepolia Testnet / Remix VM)
1. Mở [Remix IDE](https://remix.ethereum.org).
2. Tải tệp [`contracts/project/ProjectCore.sol`](contracts/project/ProjectCore.sol) vào workspace của Remix.
3. Tại tab **Solidity Compiler**, chọn phiên bản `0.8.20` và ấn **Compile ProjectCore.sol**.
4. Tại tab **Deploy & Run Transactions**:
   - Nếu chạy thử nghiệm nhanh: Chọn Environment `Remix VM (Cancun / Osaka)`.
   - Nếu chạy on-chain thực tế: Chọn Environment `Injected Provider - MetaMask` (kết nối mạng Sepolia).
5. Dán địa chỉ hợp đồng đã deploy: `0x7D3bC21A8532d2011cF970C0701413C236C53Ddd` vào ô **At Address** để tương tác trực tiếp với hợp đồng Sepolia của nhóm.

### Cách 2: Chạy kiểm thử tự động nội bộ
- Cài đặt các phụ thuộc npm (nếu cần phát triển giao diện):
  ```bash
  npm install
  ```
- Toàn bộ minh chứng kiểm thử được lưu trữ tại:
  - [`evidence/lab-09/`](evidence/lab-09/): Báo cáo chu trình Gas và TimeLockVault.
  - [`evidence/lab-10/`](evidence/lab-10/): Minh chứng audit và khắc phục lỗi VaultBuggy.
  - [`evidence/lab-11/`](evidence/lab-11/): Minh chứng thực nghiệm Sepolia 1 ca hợp lệ và 1 ca vi phạm bị revert.
  - [`evidence/lab-12/`](evidence/lab-12/): Biên bản nghiệm thu Gate Review 1 và phê duyệt phạm vi đề tài.

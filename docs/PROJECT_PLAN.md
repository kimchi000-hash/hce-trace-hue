# PROJECT PLAN — HỆ THỐNG BỎ PHIẾU BAN CÁN SỰ CLB (CLUB VOTING)
## Đề tài: Bầu cử Kín 2 pha (Commit - Reveal) kết hợp Quorum (Basis Points)

---

## 1. Thành viên, Phân vai và Xoay vòng vai trò (Role Rotation)

Để đáp ứng yêu cầu học phần ECO2432 về việc trải nghiệm đa dạng các vị trí kỹ thuật Web3, nhóm thực hiện luân chuyển vai trò chính giữa 2 giai đoạn:

| Họ và tên | Mã SV | Vai trò chính Giai đoạn 1 (Lab 8 – 11) | Vai trò chính Giai đoạn 2 (Lab 12 – 15) | Nhiệm vụ trọng tâm Lab 12–15 |
| :--- | :---: | :--- | :--- | :--- |
| **Nguyễn Thị Kim Chi** | 23K4300025 | **Đặc tả (BA) & Hợp đồng (Smart Contract Dev)** | **Kiểm thử An ninh (Security Tester) & Quản trị Repo** | - Phụ trách hồ sơ Gate Review 1 (Lab 12)<br>- Xây dựng 7 ca kiểm thử tấn công (Lab 13)<br>- Chủ trì rà soát chéo (Cross-audit Lab 14)<br>- Quản trị CI/CD và chất lượng nhánh `main` |
| **Võ Thị Thư** | 23K4300038 | **Kiểm thử (Tester) & Hỗ trợ Hợp đồng** | **Lập trình Giao diện (Frontend Dev) & Tích hợp Web3** | - Phối hợp thẩm định Gate Review 1 (Lab 12)<br>- Thiết kế UI/UX giao diện Web DApp (Lab 15)<br>- Tích hợp thư viện `ethers.js v6` tự động băm `commitment`<br>- Triển khai DApp hoàn chỉnh lên GitHub Pages |

---

## 2. Người dùng và Nỗi đau cần giải quyết (Problem & Users)
- **Người dùng chính:** Sinh viên trong lớp học phần ECO2432, thành viên Câu lạc bộ sinh viên, và Giảng viên / Ban cán sự.
- **Nỗi đau thực tế:**
  1. *Bầu cử truyền thống:* Nguy cơ gian lận kiểm phiếu, thiếu minh bạch, bỏ phiếu hộ hoặc sai sót do con người.
  2. *Bầu cử on-chain thông thường (v1.0):* Mọi người nhìn thấy số phiếu nhảy tức thời, gây ra **hiệu ứng tâm lý đám đông (Bandwagon Effect)** và áp lực xã hội lên các cử tri bầu sau.
- **Giải pháp vượt trội (v2.0):** Triển khai cơ chế **Bầu cử kín 2 pha Commit - Reveal** trên mạng Sepolia. Lá phiếu được mã hóa bằng `keccak256(candidateId, salt, msg.sender)` ở pha Commit, chỉ mở ở pha Reveal, và kết quả chỉ được công nhận khi đạt ngưỡng túc số `quorumBps = 5,000` (50.00%).

---

## 3. Tiến độ thực hiện các mốc bắt buộc (Milestones & Progress)

| Mốc bài Lab | Nội dung công việc trọng tâm | Sản phẩm bàn giao chính | Trạng thái nghiệm thu |
| :---: | :--- | :--- | :---: |
| **Lab 08** | Khởi tạo codebase nhóm, phân công vai trò, đặc tả v0.1 và quy tắc kinh tế ban đầu | [`docs/PROJECT_PLAN.md`](PROJECT_PLAN.md), [`docs/SPEC.md`](SPEC.md), [`docs/ECONOMIC_RULES.md`](ECONOMIC_RULES.md) | ✅ **HOÀN THÀNH** |
| **Lab 09** | Viết và biên dịch hợp đồng cốt lõi `ProjectCore.sol`, đo đạc chi phí Gas trên Remix VM | [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol), [`evidence/lab-09/`](../evidence/lab-09/) | ✅ **HOÀN THÀNH** |
| **Lab 10** | Rà soát mã nguồn do AI sinh ra (Audit `VaultBuggy.sol` và `ProjectCore.sol`), vá lỗi CEI và Custom Errors | [`docs/AI_JOURNAL.md`](AI_JOURNAL.md), [`evidence/lab-10/`](../evidence/lab-10/) | ✅ **HOÀN THÀNH** |
| **Lab 11** | Nâng cấp Bầu cử kín Commit - Reveal có Quorum, triển khai Sepolia, thực nghiệm 1 ca hợp lệ và 1 ca gian lận | [`evidence/lab-11/README.md`](../evidence/lab-11/README.md), Hợp đồng trên Sepolia | ✅ **HOÀN THÀNH** |
| **Lab 12** | **Gate Review 1:** Duyệt Codebase, bảo vệ kịch bản 3 phút, kiểm tra 5/5 tiêu chuẩn sức khỏe repo và khóa phạm vi | [`docs/GATE_REVIEW_1.md`](GATE_REVIEW_1.md), [`evidence/lab-12/README.md`](../evidence/lab-12/README.md) | ✅ **HOÀN THÀNH (ĐẠT)** |
| **Lab 13** | Kiểm thử chuyên sâu dòng điều khiển: Xây dựng bộ test suite 7 ca tấn công gian lận và hardening | [`evidence/lab-13/`](../evidence/lab-13/) | 🔄 *Sắp thực hiện* |
| **Lab 14** | Rà soát chéo (Cross-audit) hợp đồng với nhóm đối tác, ghi nhận biên bản đối soát và khắc phục | [`docs/CROSS_AUDIT.md`](CROSS_AUDIT.md) | 🔄 *Sắp thực hiện* |
| **Lab 15** | Hoàn thiện giao diện Web DApp tự động tính băm bằng `ethers.js v6` và triển khai lên GitHub Pages | Thư mục [`web/`](../web/), URL GitHub Pages | 🔄 *Sắp thực hiện* |

---

## 4. Phạm vi sau Gate Review 1 (Locked Scope)

Để bảo đảm chất lượng sản phẩm cao nhất trước hạn nộp cuối cùng, Hội đồng thẩm định và Nhóm đã thống nhất **khóa chặt phạm vi dự án** như sau:

### 4.1 Tính năng cốt lõi được giữ lại và bảo đảm chạy vững (In-Scope)
- Chu trình 4 pha độc lập: `Registration` $\rightarrow$ `Commit` $\rightarrow$ `Reveal` $\rightarrow$ `Ended`.
- Ràng buộc nộp mã băm: $\text{commitment} = \text{keccak256}(\text{candidateId}, \text{salt}, \text{msg.sender})$ chống sao chép phiếu (Anti Copy-Voting).
- Kiểm soát Quorum bằng đơn vị Basis Point: $\text{quorumBps} = 5,000$ (50.00% cử tri hợp lệ).
- Hợp đồng tinh gọn 125 dòng mã tuân thủ tuyệt đối quy ước `AGENTS.md` (Solidity `^0.8.20`, Custom Errors, CEI).

### 4.2 Tính năng chủ động cắt bỏ (Out-of-Scope)
- **Không phát hành Token ERC-20:** Không tích hợp tính năng tài chính mang tính đầu cơ, quyền cử tri chỉ quản lý qua danh sách Whitelist on-chain `isVoter`.
- **Không thiết kế bầu cử đa vòng phức tạp:** Giữ luồng bầu cử 1 vòng chuẩn xác, trường hợp hòa phiếu hoặc không đủ Quorum thì hàm `result()` trả về `valid = false` để tổ chức bầu lại.
- **Không tích hợp KYC off-chain nặng nề:** Chỉ quản trị danh tính sinh viên qua cặp khóa ví công khai được Admin cấp phép trước mốc `regEnd`.

---

## 5. Kế hoạch hành động cụ thể cho Giai đoạn tiếp theo (Lab 13 – 15)

1. **Tuần tới (Lab 13 — Hạn chót: trước buổi Lab 13):**
   - Người phụ trách: **Nguyễn Thị Kim Chi**
   - Mục tiêu: Hoàn thành bộ 7 kịch bản kiểm thử tấn công (Reentrancy, Front-running commitment, Double reveal, Wrong Phase manipulation, Quorum failure edge cases).
2. **Tuần tiếp theo (Lab 14 — Hạn chót: trước buổi Lab 14):**
   - Người phụ trách: **Nguyễn Thị Kim Chi** & **Võ Thị Thư**
   - Mục tiêu: Thực hiện audit chéo với ít nhất 1 nhóm bạn, lập tài liệu `docs/CROSS_AUDIT.md`.
3. **Tuần hoàn thiện (Lab 15 — Hạn chót: trước buổi Lab 15):**
   - Người phụ trách: **Võ Thị Thư**
   - Mục tiêu: Tích hợp thư viện `ethers.js v6` vào giao diện `web/index.html`, tự động hóa sinh `salt` và `commitment`, xuất bản DApp lên GitHub Pages.

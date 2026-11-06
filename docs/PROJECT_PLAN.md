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
- **Giải pháp vượt trội (v2.0):** Triển khai cơ chế **Bầu cử kín 2 pha Commit - Reveal** trên mạng Sepolia. Lá phiếu được mã hóa bằng `keccak256(id, candidateId, salt, msg.sender)` ở pha Commit, chỉ mở ở pha Reveal, và kết quả chỉ được công nhận khi đạt ngưỡng túc số `quorumBps = 5,000` (50.00%).

---

## 3. Tiến độ thực hiện các mốc bắt buộc (Milestones & Progress)

| Mốc bài Lab | Nội dung công việc trọng tâm | Sản phẩm bàn giao chính | Trạng thái nghiệm thu |
| :---: | :--- | :--- | :---: |
| **Lab 08** | Khởi tạo codebase nhóm, phân công vai trò, đặc tả v0.1 và quy tắc kinh tế ban đầu | [`docs/PROJECT_PLAN.md`](PROJECT_PLAN.md), [`docs/SPEC.md`](SPEC.md), [`docs/ECONOMIC_RULES.md`](ECONOMIC_RULES.md) | ✅ **HOÀN THÀNH** |
| **Lab 09** | Viết và biên dịch hợp đồng cốt lõi `ProjectCore.sol`, đo đạc chi phí Gas trên Remix VM | [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol), [`evidence/lab-09/`](../evidence/lab-09/) | ✅ **HOÀN THÀNH** |
| **Lab 10** | Rà soát mã nguồn do AI sinh ra (Audit `VaultBuggy.sol` và `ProjectCore.sol`), vá lỗi CEI và Custom Errors | [`docs/AI_JOURNAL.md`](AI_JOURNAL.md), [`evidence/lab-10/`](../evidence/lab-10/) | ✅ **HOÀN THÀNH** |
| **Lab 11** | Nâng cấp Bầu cử kín Commit - Reveal có Quorum, triển khai Sepolia, thực nghiệm 1 ca hợp lệ và 1 ca gian lận | [`evidence/lab-11/README.md`](../evidence/lab-11/README.md), Hợp đồng trên Sepolia | ✅ **HOÀN THÀNH** |
| **Lab 12** | **Gate Review 1:** Duyệt Codebase, bảo vệ kịch bản 3 phút, kiểm tra 5/5 tiêu chuẩn sức khỏe repo và khóa phạm vi | [`docs/GATE_REVIEW_1.md`](GATE_REVIEW_1.md), [`evidence/lab-12/README.md`](../evidence/lab-12/README.md) | ✅ **HOÀN THÀNH (ĐẠT)** |
| **Lab 13** | Kiểm thử chuyên sâu: bộ test nhóm A–H (gồm nhóm E chuyên gian lận) và hardening; sau nâng cấp V2 bộ test mở rộng thành 201 ca Hardhat + 82 ca SQL | [`test/`](../test/), [`evidence/lab-13/`](../evidence/lab-13/), [`docs/GAS_REPORT.md`](GAS_REPORT.md) | ✅ **HOÀN THÀNH** |
| **Lab 14** | Rà soát chéo: có sẵn báo cáo về hợp đồng của nhóm VotaChain (`AUDIT_REPORT.md`); tự rà soát theo 10 hạng mục; chờ báo cáo nhận | [`docs/AUDIT_REPORT.md`](AUDIT_REPORT.md), [`docs/SELF_AUDIT.md`](SELF_AUDIT.md) | 🔄 *Chờ báo cáo từ nhóm bạn* |
| **Lab 15** | Giao diện Web DApp dùng `ethers.js v6`; triển khai lại Sepolia và GitHub Pages | [`web/`](../web/), [`docs/SEPOLIA_DEPLOY_V2.md`](SEPOLIA_DEPLOY_V2.md), [`docs/PRESENTATION_PLAN.md`](PRESENTATION_PLAN.md) | 🔄 *V2 đã triển khai Sepolia (`deployments/sepolia.json`); chờ URL công khai (Vercel) và bằng chứng giao dịch V2* |

---

## 4. Phạm vi sau Gate Review 1 (Locked Scope)

Để bảo đảm chất lượng sản phẩm cao nhất trước hạn nộp cuối cùng, Hội đồng thẩm định và Nhóm đã thống nhất **khóa chặt phạm vi dự án** như sau:

### 4.1 Tính năng cốt lõi được giữ lại và bảo đảm chạy vững (In-Scope)
- Chu trình 4 pha theo thời gian: `Registration` (người duyệt ký) $\rightarrow$ `Commit` $\rightarrow$ `Reveal` $\rightarrow$ `Ended`; nhiều cuộc bầu cử độc lập trong một hợp đồng.
- Ràng buộc nộp mã băm: $\text{commitment} = \text{keccak256}(\text{id}, \text{candidateId}, \text{salt}, \text{msg.sender})$ chống sao chép và phát lại phiếu.
- Danh sách cử tri bằng Merkle root; người duyệt độc lập; kết quả chỉ hợp lệ khi đủ quorum và không hòa.
- Kiểm soát Quorum bằng đơn vị Basis Point: $\text{quorumBps} = 5,000$ (50.00% cử tri hợp lệ).
- Ba hợp đồng V2: `ProjectCore` 585 dòng, `OrganizationRegistry` 278 dòng, `VoterCardSBT` 314 dòng (`ProjectCore` vượt mốc 150 dòng của bộ lọc; đã nêu và chờ giảng viên xác nhận, xem `GATE_REVIEW_1.md` phụ lục), vẫn tuân thủ quy ước `AGENTS.md` (Solidity `^0.8.20`, Custom Errors, CEI, sự kiện cho mọi thay đổi trạng thái).

### 4.2 Tính năng chủ động cắt bỏ (Out-of-Scope)
- **Không phát hành Token ERC-20:** Không tích hợp tính năng tài chính mang tính đầu cơ, quyền cử tri chỉ xác định bằng Merkle root của danh sách địa chỉ.
- **Không thiết kế bầu cử đa vòng phức tạp:** Giữ luồng bầu cử 1 vòng chuẩn xác, trường hợp hòa phiếu hoặc không đủ Quorum thì hàm `result()` trả về `valid = false` để tổ chức bầu lại.
- **Không tích hợp KYC off-chain nặng nề:** Danh tính sinh viên ↔ ví do ban tổ chức lập danh sách và người duyệt kiểm tra ngoài chuỗi trước mốc `regEnd`.

---

## 5. Việc còn lại

| # | Việc | Người phụ trách | Hạn | Trạng thái |
| :-: | :--- | :-: | :-: | :-: |
| 1 | Chạy trọn một cuộc bầu V2 trên Sepolia (tổ chức → duyệt → commit → reveal → result → SBT) và ghi mã giao dịch vào `evidence/v2/README.md` | Kim Chi | trước Lab 20 | ☐ |
| 2 | Chạy migration `20261106000001_organization_profile.sql` **và `20261106000002_visibility.sql`** (phạm vi xem) trên Supabase thật, triển khai lại `chain-sync`; thử lưu/đọc hồ sơ tổ chức và ảnh ứng viên với Supabase thật (các test giao diện hiện dùng Supabase giả lập) | Kim Chi | trước Lab 20 | ☐ |
| 3 | Triển khai web lên Vercel (URL công khai, sống ≥ 6 tháng), thử trên điện thoại | Kim Chi | trước Lab 19 | ☐ |
| 4 | Gộp nhánh `phase4-supabase` vào `main` sau khi bước 2–3 đạt | Cả hai | sau bước 3 | ☐ |
| 5 | Xử lý báo cáo rà soát chéo nhận từ nhóm bạn (điền `docs/SELF_AUDIT.md` mục chờ) | Cả hai | trước Lab 20 | ☐ |
| 6 | Hỏi giảng viên xác nhận việc `ProjectCore.sol` vượt mốc 150 dòng | Kim Chi | sớm | ☐ |
| 7 | Poster A2 (có mã QR tới URL công khai) + video 90 giây | Võ Thư | Lab 19 | ☐ |
| 8 | Luyện vấn đáp theo `docs/FUNCTION_MAP.md`: mỗi người giải thích được mọi hàm, ưu tiên `commit`, `reveal`, `result`, `createElection`, `approveElection`, `mint` | Cả hai | Lab 21 | ☐ |
| 9 | Bảo đảm lịch sử commit của cả hai thành viên cân bằng | Cả hai | liên tục | ☐ |

# BIÊN BẢN NGHIỆM THU GATE REVIEW 1 (LAB 12)
## Đề tài: Hệ thống Bầu cử Kín 2 pha (Commit - Reveal) kết hợp Quorum
### Học phần: ECO2432 — Web3 Starter

- **Hợp đồng kiểm nghiệm:** [`contracts/project/ProjectCore.sol`](../../contracts/project/ProjectCore.sol)
- **Địa chỉ hợp đồng trên Sepolia:** [`0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`](https://sepolia.etherscan.io/address/0x7D3bC21A8532d2011cF970C0701413C236C53Ddd)
- **Hội đồng thẩm định & Thành viên:**
  - Nguyễn Thị Kim Chi (Mã SV: 23K4300025) — Smart Contract Dev / Tester
  - Võ Thị Thư (Mã SV: 23K4300038) — Frontend Dev / Tester
- **Kết quả đánh giá Gate Review 1:** **ĐẠT (QUA — APPROVED) [5/5 Tiêu chí Đạt]**
- **Xếp loại đề tài:** **Đề tài Nâng cao** (Vượt chuẩn cơ bản nhờ cơ chế Commit - Reveal & Quorum bằng điểm cơ bản)

---

## 1. Kết quả Kiểm tra Sức khỏe Codebase (Health Checklist 5/5)

| Tiêu chuẩn thẩm định | Yêu cầu chuẩn | Kết quả tự đánh giá | Bằng chứng kiểm tra |
| :--- | :--- | :---: | :--- |
| **1. Tính đầy đủ của README** | Mô tả rõ ràng bài toán, đối tượng sử dụng, kiến trúc và hướng dẫn chạy | **ĐẠT** `[x]` | [`README.md`](../../README.md) cập nhật đầy đủ bài toán Bầu cử kín, kiến trúc 4 pha và link Etherscan Sepolia. |
| **2. Tính đồng bộ tài liệu** | `PROJECT_PLAN.md`, `SPEC.md`, `ECONOMIC_RULES.md` khớp 100% với hợp đồng | **ĐẠT** `[x]` | Khớp 100% với `ProjectCore.sol` (125 dòng mã, 4 pha, 5 quy tắc R1–R5, Quorum basis points). |
| **3. Biên dịch & Triển khai thực tế** | Hợp đồng biên dịch không lỗi và đã deploy lên mạng Sepolia Testnet | **ĐẠT** `[x]` | Địa chỉ: `0x7D3bC21A8532d2011cF970C0701413C236C53Ddd`. |
| **4. Bằng chứng thực nghiệm on-chain** | Đủ 1 ca hợp lệ và 1 ca vi phạm bị revert trên Sepolia | **ĐẠT** `[x]` | [`evidence/lab-11/README.md`](../lab-11/README.md) ghi nhận Block `11899220` (Success) và Block `11899237` (Reverted). |
| **5. Lịch sử đóng góp Git** | Lịch sử commit cân bằng và thể hiện rõ ràng phần việc của từng thành viên | **ĐẠT** `[x]` | Commit log trên nhánh `main` ghi nhận đầy đủ các mốc nghiệm thu từ Lab 8 đến Lab 12. |

---

## 2. Tóm tắt Kịch bản Demo 3 phút đã bảo vệ

1. **0:00 – 0:30 (Vấn đề & Nỗi đau):** Bầu cử truyền thống có nguy cơ gian lận; bầu on-chain mở làm lộ số phiếu tức thời gây hiệu ứng đám đông. Giải pháp là Bầu cử kín 2 pha Commit - Reveal.
2. **0:30 – 1:00 (Quy tắc kinh tế):** Ràng buộc `keccak256(candidateId, salt, msg.sender)` chống sao chép phiếu trong mempool; Quorum bắt buộc $\text{quorumBps} = 5,000$ (50.00%).
3. **1:00 – 2:00 (Demo hợp đồng & Sepolia Success):** Thuyết minh 125 dòng mã `ProjectCore.sol` và giao dịch `commit` thành công tại Block `11899220`.
4. **2:00 – 2:30 (Demo Negative Test):** Thuyết minh giao dịch nộp phiếu lặp bị revert với mã lỗi `AlreadyCommitted()` tại Block `11899237` (`Status: 0`).
5. **2:30 – 3:00 (Kế hoạch Lab 13–15):** Định hướng xây dựng test suite 7 ca tấn công (Lab 13), audit chéo (Lab 14) và DApp Frontend với ethers.js v6 (Lab 15).

---

## 3. Quyết định Khóa Phạm vi (Scope Lock Decision)

- **Chấp thuận giữ lại (In-Scope):** Luồng Bầu cử kín 2 pha hoàn chỉnh kèm Quorum và xử lý hòa phiếu tự động; giao diện DApp hỗ trợ tính mã băm tự động.
- **Cắt bỏ để bảo toàn chất lượng (Out-of-Scope):** Không phát hành token ERC-20 đầu cơ; không làm bầu cử đa vòng phức tạp; giữ hợp đồng dưới 150 dòng (hiện tại 125 dòng).
- **Phân công luân chuyển vai trò Giai đoạn 2 (Lab 12–15):**
  - **Nguyễn Thị Kim Chi:** Kiểm thử chuyên sâu, Test suite 7 ca tấn công Lab 13, Rà soát chéo Lab 14 và Quản trị Repo.
  - **Võ Thị Thư:** Lập trình Giao diện Web DApp Lab 15, tích hợp ethers.js v6 và triển khai GitHub Pages.

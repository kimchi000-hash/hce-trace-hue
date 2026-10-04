Thành viên 1:
Họ tên: Nguyễn Thị Kim Chi - 23K4300025
Thành viên 2:
Họ tên: Võ Thị Thư - 23K4300038
## 📌 Bảng theo dõi tiến độ và Nghiệm thu các bài Lab (ECO2432)

### Thông tin dự án
- **Đề tài:** Hệ thống Bỏ phiếu Ban cán sự Lớp on-chain (Club Voting)
- **Nhóm sinh viên thực hiện:**
  - **Nguyễn Thị Kim Chi** (23K4300025) — Đặc tả (BA), Smart Contract Dev
  - **Võ Thị Thu** (23K4300038) — Tester, Giao diện (Frontend)[cite: 10]

---

### Danh mục sản phẩm bàn giao (Deliverables)

| Bài Lab | Hạng mục sản phẩm | Đường dẫn tệp / Artifact kiểm tra | Người phụ trách chính | Trạng thái nghiệm thu |
| :--- | :--- | :--- | :--- | :---: |
| **Lab 08** | **Kế hoạch dự án & Phân vai** | [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) | Kim Chi & Võ Thu[cite: 10] | ✅ Đã hoàn thành[cite: 10] |
| **Lab 08** | **Đặc tả nghiệp vụ v0.1** | [`docs/SPEC.md`](docs/SPEC.md) | Kim Chi[cite: 10] | ✅ Đã hoàn thành[cite: 10] |
| **Lab 08** | **Quy tắc kinh tế & Chống lạm dụng** | [`docs/ECONOMIC_RULES.md`](docs/ECONOMIC_RULES.md) | Kim Chi[cite: 10] | ✅ Đã hoàn thành[cite: 10] |
| **Lab 08** | **Commit khởi tạo codebase nhóm** | Commit message: `lab-08: khoi tao codebase nhom va dac ta v0.1` | Cả hai thành viên[cite: 10] | ✅ Đã đóng dấu[cite: 10] |
| **Lab 09** | **Hợp đồng cốt lõi sản phẩm** | [`contracts/project/ProjectCore.sol`](contracts/project/ProjectCore.sol) | Kim Chi[cite: 10] | ✅ Biên dịch thành công (Remix 0.8.20+) |
| **Lab 09** | **Nhật ký AI & Đối soát lỗi cú pháp** | [`docs/AI_JOURNAL.md`](docs/AI_JOURNAL.md) | Kim Chi[cite: 10] | ✅ Đã ghi nhận (sửa lỗi dòng 21)[cite: 10, 14] |
| **Lab 09** | **Thực nghiệm kỹ thuật & Bảng đo Gas** | [`evidence/lab-09/gas_report.md`](evidence/lab-09/gas_report.md) | Võ Thu[cite: 10, 11] | ✅ Đủ 3 mốc gas trên Remix VM[cite: 10, 11] |
| **Lab 09** | **Minh chứng chu trình TimeLockVault** | [`evidence/lab-09/`](evidence/lab-09/) (Ảnh 01–04) | Võ Thu[cite: 10] | ✅ Đã nộp ảnh Deploy, Deposit, Withdraw[cite: 10] |
| **Lab 09** | **Commit nghiệm thu hợp đồng** | Commit message: `lab-09: contract loi bien dich duoc` | Cả hai thành viên[cite: 10] | ✅ Đã đóng dấu[cite: 10] |
# ECO2432 Web3 Starter

Kho khởi đầu dùng xuyên suốt 15 bài thực hành.

## Bắt đầu (thay cho bước "Fork kho" trong sổ tay)

Sổ tay ghi "Fork kho `hce-web3-starter`". Học kỳ này kho được phát dạng tệp nén, nên làm như sau:

1. Giải nén thư mục này vào máy, mở bằng Antigravity.
2. Đọc `AGENTS.md` trước khi yêu cầu công cụ AI sinh mã.
3. Sao chép `SPEC.md` và `AI_JOURNAL.md` cho từng bài.
4. Chỉ dùng ví thử nghiệm và mạng Sepolia; không dùng khóa ví có tiền thật.

Đưa lên GitHub (làm khi đã có tài khoản; cần trước khi nộp Lab 1):

```bash
git init -b main
git add .
git commit -m "chore: thiet lap moi truong lam viec"
git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git   # repo tạo TRỐNG trên GitHub
git push -u origin main
```

Lab 8 (repo nhóm): một thành viên tạo repo trống mới, đưa nội dung thư mục này lên theo đúng các
lệnh trên, rồi mời các thành viên khác làm collaborator.

## Cấu trúc

- `contracts/training/`: hợp đồng mẫu dùng ở Lab 9, 10, 11 và 13
  (`TimeLockVault`, `VaultBuggy`, `ClassPoint`, `VulnerableBank`).
- `contracts/lab04/ClubTokens.sol`: ba token dùng cho Lab 4.
- `web/index.html`: giao diện mẫu dùng ở Lab 15.
- `prompt_templates.md`: mẫu câu lệnh có yêu cầu và tiêu chí kiểm chứng rõ ràng.

Các hợp đồng có chữ `Buggy`, `Vulnerable` hoặc cảnh báo trong mã đều chứa lỗi có chủ đích.

## Chạy hợp đồng

- Cách chính: mở Remix IDE (`https://remix.ethereum.org`), tạo tệp, dán mã. Remix tự tải thư viện
  `@openzeppelin/...`, không cần cài gì.
- Nếu Antigravity gạch đỏ dòng `import "@openzeppelin/..."`: đó là do máy chưa có thư viện, mã
  không sai. Muốn hết gạch đỏ thì cài Node.js rồi chạy `npm install` trong thư mục này (không bắt buộc).

# MINH CHỨNG THỰC NGHIỆM LAB 10 — AUDIT & KIỂM THỬ REMIX VM

- **Người thực hiện:** Võ Thị Thư (Mã SV: 23K4300038)
- **Hợp đồng kiểm nghiệm:** `VaultFixed.sol` (Bản vá an ninh của `VaultBuggy.sol`) & `ProjectCore.sol`
- **Môi trường thực thi:** Remix VM (Osaka / Cancun)

---

## Danh mục hình ảnh minh chứng

| STT | Tệp minh chứng | Thao tác kiểm thử | Kết quả ghi nhận | Ý nghĩa an ninh |
| :---: | :--- | :--- | :--- | :--- |
| **01** | [`Screenshot 2026-10-04 151155.png`](Screenshot%202026-10-04%20151155.png) | Gọi `emergencyWithdraw()` từ Account 2 (không phải chủ sở hữu) | **Revert:** `NotOwner` | Xác nhận kiểm soát quyền truy cập (`onlyOwner`) hoạt động chuẩn xác, bảo vệ quỹ khẩn cấp. |
| **02** | [`Screenshot 2026-10-04 162846.png`](Screenshot%202026-10-04%20162846.png) | Gọi `withdraw()` rút tiền đúng hạn | **Thành công** (Transaction Cost: `32,559 gas`, Execution Cost: `16,295 gas`) | Rút tiền an toàn tuân thủ mô hình Checks-Effects-Interactions (CEI) triệt tiêu lỗ hổng Reentrancy. |

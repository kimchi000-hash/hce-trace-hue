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

# BÁO CÁO RÀ SOÁT & KIỂM THỬ MÃ NGUỒN — LAB 10 (Audit & Hardening)

- **Người thực hiện:** Võ Thị Thư (Mã SV: 23K4300038)
- **Hợp đồng kiểm nghiệm:** `VaultFixed.sol` (Bản vá an ninh của `VaultBuggy.sol`) & `ProjectCore.sol`
- **Môi trường thực thi:** Remix VM (Osaka / Cancun)[cite: 7]

---

## 1. Tổng quan Mục tiêu Bài thực hành
Lab 10 đóng vai trò cốt lõi trong việc rèn luyện tư duy kiểm toán mã nguồn do AI sinh ra[cite: 8, 9]. Mục tiêu không chỉ là chạy được chương trình mà là chủ động phát hiện các điểm yếu về phân quyền, logic nghiệp vụ, và lỗ hổng bảo mật tiềm ẩn trước khi đưa hợp đồng lên mạng chính thức[cite: 9].

---

## 2. Chi tiết Thực nghiệm & Kết quả Rà soát trên Remix VM

### Thao tác 1: Kiểm tra Phân quyền Khẩn cấp (`emergencyWithdraw`)
- **Mô tả hành vi kiểm thử:** Đóng vai một tài khoản không phải chủ sở hữu (`Account 2`) cố tình gọi hàm `emergencyWithdraw()` để rút quỹ khẩn cấp[cite: 7].
- **Kết quả ghi nhận:** Giao dịch lập tức bị từ chối và hoàn tác (Revert) với mã lỗi tùy chỉnh `NotOwner`[cite: 7].
- **Ý nghĩa an ninh:** Xác nhận cơ chế kiểm soát quyền truy cập (modifier `onlyOwner`) hoạt động hoàn toàn chính xác, bảo vệ thành công tài sản của hệ thống khỏi các hành vi xâm nhập trái phép[cite: 7].
- **Minh chứng thực nghiệm:**
  ![Kiểm tra phân quyền khẩn cấp](./Screenshot%202026-10-04%20151155.png)

---

### Thao tác 2: Kiểm tra Nghiệp vụ Rút tiền Đúng hạn (`withdraw`)
- **Mô tả hành vi kiểm thử:** Thực hiện gọi hàm `withdraw()` để rút tiền theo đúng quy chuẩn thời gian và điều kiện đã định[cite: 7].
- **Kết quả ghi nhận:** Giao dịch thực hiện thành công rực rỡ[cite: 7]. 
  - Transaction Cost: `32,559 gas`[cite: 7]
  - Execution Cost: `16,295 gas`[cite: 7]
- **Ý nghĩa an ninh:** Quá trình giao dịch tuân thủ tuyệt đối mô hình **Checks-Effects-Interactions (CEI)**, triệt tiêu hoàn toàn rủi ro tái nhập (`Reentrancy`) và đảm bảo tính toàn vẹn số liệu[cite: 7].
- **Minh chứng thực nghiệm:**
  ![Rút tiền đúng hạn](./Screenshot%202026-10-04%20162846.png)

---

## 3. Tổng kết Nhật ký Sửa lỗi (AI_JOURNAL Highlights)
- Quá trình rà soát đã giúp phát hiện các đoạn mã sinh tự động có xu hướng bỏ sót điều kiện kiểm tra địa chỉ rỗng (`address(0)`) hoặc dùng chuỗi `require` dài gây tốn gas. 
- Việc chủ động vá lỗi và kiểm chứng thực tế qua các ca kiểm thử giúp củng cố tính vững chãi cho mã nguồn trước khi tích hợp vào đồ án tổng thể (`ProjectCore.sol`).

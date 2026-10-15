# BÁO CÁO RÀ SOÁT CHÉO (CROSS-AUDIT REPORT) — LAB 14

- **Nhóm thực hiện rà soát (Auditor):** Nhóm DETAI7
- **Nhóm có sản phẩm được rà soát (Target):** Nhóm VotaChain
- **Đối tượng rà soát:** Hợp đồng `ProjectCore.sol` (HCE Soulbound Achievement Badge v0.2)
- **Ngày thực hiện:** 15/10/2026

---

## 1. Tóm tắt kết quả (Executive Summary)
Đã tiến hành rà soát toàn bộ tệp mã nguồn `ProjectCore.sol`. Đánh giá chung: Hợp đồng có chất lượng tốt, đã tuân thủ mô hình CEI để chống Reentrancy và có cơ chế giới hạn vòng lặp `issueBatch` hợp lý. Tuy nhiên, quá trình kiểm tra chuyên sâu ghi nhận tổng số **2 vấn đề logic** cần lưu ý:
- **Nghiêm trọng (Critical):** 0
- **Trung bình (Medium):** 1
- **Nhẹ / Khuyến nghị (Low/Info):** 1

---

## 2. Chi tiết các phát hiện (Findings)

### Phát hiện 1 — Lỗ hổng cấp phát sai loại huy hiệu (Missing Badge Type Validation)
- **Mức độ:** Trung bình (Medium)
- **Vị trí:** Dòng 81-83, trong hàm `issueBadge()`.
- **Mô tả:** Hàm `issueBadge` có kiểm tra giới hạn `limit = maxSupplyPerType[badgeType]`. Tuy nhiên, nếu một `badgeType` chưa từng được cấu hình (limit mặc định bằng `0`), hệ thống sẽ bỏ qua câu lệnh `if (limit > 0...)` và vẫn tiến hành cấp phát bình thường.
- **Tình huống gây thiệt hại:** Một Issuer (CLB/Khoa) có thể gõ nhầm mã loại huy hiệu (ví dụ thay vì `1` lại gõ `999`). Do không có bước kiểm tra tính tồn tại của `badgeType`, hệ thống vẫn in ra một SBT rác với `badgeType = 999` ghi vĩnh viễn lên blockchain, làm hỏng tính toàn vẹn của dữ liệu thành tích.
- **Khuyến nghị:** Cần thêm một cấu trúc `mapping(uint256 => bool) public isValidBadgeType;` để quản trị viên (Owner) định nghĩa trước các loại huy hiệu hợp lệ. Trong hàm `issueBadge`, bổ sung kiểm tra: `require(isValidBadgeType[badgeType], "Loai huy hieu khong ton tai");`

---

### Phát hiện 2 — Rủi ro hoàn tác toàn bộ giao dịch lô (All-or-Nothing Batch Revert)
- **Mức độ:** Nhẹ (Low / Logic Edge Case)
- **Vị trí:** Dòng 115-117, vòng lặp `for` trong hàm `issueBatch()`.
- **Mô tả:** Hàm gọi lặp lại `issueBadge()` cho từng địa chỉ trong mảng `students`. Nếu chỉ có **một** địa chỉ trong mảng vi phạm điều kiện (ví dụ: bị trùng `hasBadgeType` hoặc là `address(0)`), toàn bộ giao dịch chứa 50 sinh viên sẽ bị `Revert` lập tức.
- **Tình huống gây thiệt hại:** Gây tốn kém gas vô ích cho Issuer và làm gián đoạn quy trình trao giải tự động, vì quản trị viên phải dò tìm bằng tay xem sinh viên nào bị lỗi để loại ra khỏi mảng rồi mới gửi lại giao dịch.
- **Khuyến nghị (Không bắt buộc sửa ngay):** Thay vì dùng `revert` trực tiếp trong `issueBadge`, có thể cân nhắc bắt lỗi ngầm (silently skip) các địa chỉ không hợp lệ trong lô, hoặc phát ra một Event `BadgeIssueFailed` cho địa chỉ đó để tiếp tục chạy nốt phần còn lại của danh sách.

---

## 3. Phản hồi và Xử lý từ Nhóm được Rà soát (Target Team Feedback)
- **Trạng thái xử lý:** *(Nhóm bạn điền vào đây sau khi gửi báo cáo cho họ)*
- **Hành động khắc phục:** *(Chờ nhóm bạn cập nhật)*

# NHIỆM VỤ RÀ SOÁT CHÉO (CROSS-AUDIT ASSIGNMENT) — LAB 14

- **Nhóm thực hiện (Auditor):** Nhóm [Tên nhóm của bạn]
- **Nhóm được rà soát (Target):** Nhóm [Tên nhóm được phân công]
- **Mục tiêu:** Kiểm tra chéo mã nguồn `contracts/project/ProjectCore.sol` và tệp đặc tả `docs/SPEC.md` của nhóm bạn theo danh mục kiểm tra an ninh bắt buộc.

---

## 📋 Danh mục Kiểm tra Nhiệm vụ (Audit Checklist)
Nhóm thực hiện rà soát sẽ đối chiếu mã nguồn dựa trên các tiêu chí kỹ thuật cốt lõi sau đây, bắt buộc phải **trích dẫn số dòng** cho mọi phát hiện[cite: 8]:

1. **Phân quyền (Access Control):** Mọi hàm nhạy cảm có kiểm tra người gọi không? Có hàm nào quên kiểm tra không?[cite: 8]
2. **Thứ tự thao tác (State Updates & CEI):** Có hàm nào chuyển tiền ra ngoài *trước* khi cập nhật biến trạng thái không? (Kiểm tra chống Reentrancy)[cite: 8]
3. **Điều kiện thời gian (Time Conditions):** Dấu so sánh thời gian có đúng chiều không? (Kiểm tra trường hợp đúng bằng mốc)[cite: 8]
4. **Phép chia (Division Safety):** Có phép chia nào làm tròn xuống thành 0 với số nhỏ không?[cite: 8]
5. **Cách chuyển ETH (Transfer Method):** Dùng `call` hay `transfer`? Có kiểm tra kết quả trả về không?[cite: 8]
6. **Dữ liệu riêng tư (Visibility):** Có dữ liệu nào tưởng là bí mật trên chuỗi nhưng thực ra ai cũng đọc được không?[cite: 8]
7. **Vòng lặp (Loops & Gas Limit):** Có vòng lặp nào chạy trên danh sách dài không giới hạn nguy cơ gây tràn giới hạn phí (Out of Gas) không?[cite: 8]
8. **Sự kiện (Events):** Mọi thay đổi trạng thái quan trọng có ghi lại sự kiện (Event) để tra cứu không?[cite: 8]
9. **Trường hợp số 0 (Edge Cases):** Nạp 0 đồng, rút khi số dư 0, danh sách rỗng — hệ thống xử lý thế nào?[cite: 8]
10. **Địa chỉ rỗng (Zero-Address Check):** Có kiểm tra tham số địa chỉ khác `address(0)` không?[cite: 8]

---

## 📝 Nhật ký Phát hiện & Phản hồi (Findings & Feedback Log)
*(Phần này sẽ được điền chi tiết trong quá trình rà soát trực tiếp tại lớp theo vòng tròn phân công của giảng viên).*

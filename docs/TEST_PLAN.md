# KẾ HOẠCH & KỊCH BẢN KIỂM THỬ — LAB 10

- **Dự án:** Hệ thống Bầu cử Ban Cán sự Phi tập trung
- **Người thực hiện:** Võ Thị Thư (SV: 23k4300038) — Tester
- **Đối tượng kiểm thử:** `ProjectCore.sol`

---

## 1. Danh sách Kịch bản Kiểm thử (Test Cases)

| Mã TC | Tên kịch bản | Điều kiện đầu vào (Input) | Kết quả kỳ vọng (Expected) | Trạng thái thực tế |
| :--- | :--- | :--- | :--- | :--- |
| **TC01** | Admin đăng ký cử tri hợp lệ | Ví Admin gọi `registerVoters([Ví_A, Ví_B])` | Ví_A và Ví_B có `isVoter == true`, phát sự kiện `VoterRegistered` | **PASS** |
| **TC02** | Người không phải Admin cố đăng ký cử tri | Ví cử trì gọi `registerVoters()` | Thất bại, báo lỗi tùy biến `NotAdmin()` | **PASS** |
| **TC03** | Cử trì hợp lệ bỏ phiếu lần 1 | Ví_A gọi `vote(0)` trong thời gian cho phép | Số phiếu ứng viên 0 tăng 1, `hasVoted[Ví_A] == true`, phát `Voted` | **PASS** |
| **TC04** | Cử trì bỏ phiếu lần thứ 2 | Ví_A cố gọi lại `vote(0)` | Thất bại, báo lỗi tùy biến `AlreadyVoted()` | **PASS** |
| **TC05** | Bỏ phiếu cho ứng viên không tồn tại | Ví_B gọi `vote(99)` | Thất bại, báo lỗi tùy biến `InvalidCandidate()` | **PASS** |
| **TC06** | Ví chưa đăng ký cố tình bỏ phiếu | Ví_C (chưa được cấp quyền) gọi `vote(0)` | Thất bại, báo lỗi tùy biến `NotEligible()` | **PASS** |

---

## 2. Đánh giá Tối ưu Gas (Gas Optimization)

1. **Sử dụng Custom Errors thay cho `require` string:**
   - Việc dùng `revert NotAdmin()`, `revert AlreadyVoted()` giúp tiết kiệm trung bình ~2,000–3,000 gas cho mỗi giao dịch bị revert so với chuỗi ký tự `require(condition, "Error message")`.
2. **Tuân thủ quy tắc Checks–Effects–Interactions:**
   - Đặt `hasVoted[msg.sender] = true;` trước khi tăng số phiếu giúp ngăn chặn hoàn toàn lỗi Reentrancy Attack.

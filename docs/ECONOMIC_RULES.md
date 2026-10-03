# ECONOMIC RULES & GOVERNANCE — CLUB VOTING

## 1. Dòng tiền và Quyền lợi
- Hệ thống không thu phí ETH của cử tri ngoại trừ phí gas mạng thông thường.
- Quyền lợi: Cử tri hợp lệ có 1 quyền biểu quyết (1 ví = 1 phiếu bầu ngang quyền).

## 2. Giới hạn chống lạm dụng & Tấn công Sybil
- Chặn tấn công Sybil (tự tạo hàng loạt ví để gian lận) bằng cơ chế Whitelist: chỉ các ví được đối soát đúng mã sinh viên trong danh sách lớp mới được Admin đưa vào danh sách `isVoter`.
- Khống chế trần giao dịch đăng ký: Chia mảng đăng ký cử tri thành các lô nhỏ (<200 ví/lần) để không vượt trần Gas Limit của khối giao dịch.

## 3. Quyền quản trị (Admin)
- Admin chỉ có quyền thiết lập ứng viên lúc khởi tạo và cấp quyền cử tri.
- Admin TUYỆT ĐỐI không có hàm sửa đổi số phiếu, không có hàm rút ngắn thời gian đã định và không thể tước quyền đã cấp khi hòm phiếu đang diễn ra.

## 4. Tình huống người dùng có thể bị thiệt hại
- Cử tri nộp phiếu sát giờ hết hạn: giao dịch có thể bị kẹt mempool do gas price biến động, dẫn đến quá hạn và mất quyền bầu.
- Rò rỉ danh tính lựa chọn: Vì sự kiện `Voted` công khai trên Etherscan, người ngoài có thể phân tích thời gian và địa chỉ ví để biết ai bầu cho ứng viên nào.

## 5. Phản biện của AI (theo Prompt I.6) và Giải trình của Nhóm
- **Phản biện 1:** Bỏ phiếu không kín, sự kiện `Voted(voter, candidateId)` làm lộ thông tin bầu cử.
  *Trả lời của nhóm:* Nhóm chấp nhận rủi ro này ở phiên bản v0.1 vì đây là bầu cử nội bộ CLB sinh viên; ưu tiên tính đơn giản, minh bạch và tiết kiệm chi phí gas; sẽ nghiên cứu Commit-Reveal ở phiên bản sau nếu cần.
- **Phản biện 2:** Nguy cơ nghẽn Gas nếu Admin đăng ký danh sách lớp quá đông trong một hàm `registerVoters`.
  *Trả lời của nhóm:* Nhóm đưa ràng buộc chia lô đăng ký (batch processing) dưới 150 sinh viên/lần gọi.
- **Phản biện 3:** Rủi ro tập trung hóa khi Admin đơn phương quyết định ai có tên trong Whitelist.
  *Trả lời của nhóm:* Danh sách ví sinh viên được đối chiếu công khai trên bảng tính lớp học phần trước khi nạp vào chuỗi.
- **Phản biện 4:** Không có cơ chế hủy phiếu hoặc sửa lại nếu sinh viên bấm nhầm ứng viên.
  *Trả lời của nhóm:* Thiết kế quy tắc bất biến (Immutability) là chủ đích để chống hành vi gian lận và hối lộ thay đổi quyết định sau khi đã bỏ phiếu.
- **Phản biện 5:** Không có ngưỡng cử tri tối thiểu (Quorum), nếu chỉ 1 người bầu thì ứng viên đó vẫn đắc cử.
  *Trả lời của nhóm:* Quy định điều lệ lớp sẽ kiểm tra tổng số phiếu ở khâu nghiệm thu; nếu tổng số phiếu < 50% sĩ số lớp, ban cán sự sẽ mở đợt bầu bổ sung.

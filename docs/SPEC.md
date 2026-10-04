# SPEC — HỆ THỐNG BỎ PHIẾU BAN CÁN SỰ LỚP (CLUB VOTING)

## 1. Mục đích
Hệ thống cung cấp cơ chế bỏ phiếu tín nhiệm ban cán sự lớp phi tập trung, minh bạch, bảo đảm mỗi cử tri hợp lệ chỉ được bỏ đúng 1 phiếu và kết quả không thể bị can thiệp hay sửa đổi sau khi công bố.

## 2. Đầu vào
- `names` (mảng string): Danh sách tên các ứng viên do Admin cung cấp khi khởi tạo hợp đồng.
- `durationMinutes` (uint256): Thời lượng mở hòm phiếu (tính bằng phút) do Admin quy định.
- `voters` (mảng address): Danh sách địa chỉ ví sinh viên được quyền cử tri do Admin nạp theo lô.
- `candidateId` (uint256): Số thứ tự định danh của ứng viên mà cử tri lựa chọn.

## 3. Quy tắc nghiệp vụ
- **R1 (Khởi tạo):** Chỉ Admin mới có quyền thiết lập danh sách ứng viên và thời hạn bỏ phiếu lúc triển khai hợp đồng.
- **R2 (Cấp quyền cử tri):** Chỉ Admin mới có quyền đăng ký danh sách cử tri hợp lệ (`registerVoters`).
- **R3 (Khung thời gian):** Cử tri chỉ được thực hiện bỏ phiếu trong khoảng thời gian hòm phiếu mở (`block.timestamp <= endTime`). Sau mốc này, mọi thao tác bầu cử đều bị từ chối.
- **R4 (Chống bầu 2 lần):** Mỗi cử tri chỉ được bỏ phiếu đúng 1 lần duy nhất (`hasVoted == false`). Bỏ phiếu xong trạng thái chuyển ngay sang `true`.
- **R5 (Ứng viên hợp lệ):** Cử tri chỉ được bầu cho ứng viên nằm trong danh sách đã công bố (`candidateId < candidateCount`).
- **R6 (Minh bạch kết quả):** Mọi người dùng đều có quyền xem danh sách ứng viên và số phiếu tích lũy công khai không tốn phí gas (`getResults`).

## 4. Đầu ra
- Sự kiện `VoterRegistered(address voter)` được phát ra khi cử tri được cấp quyền.
- Sự kiện `Voted(address voter, uint256 candidateId)` được ghi nhận vĩnh viễn trên blockchain khi bỏ phiếu thành công.
- Mảng danh sách ứng viên và số phiếu bầu hiển thị chi tiết khi gọi hàm `getResults()`.

## 5. Trường hợp ngoại lệ
- **E1 (Không phải Admin):** Nếu tài khoản khác Admin cố gọi hàm cấp quyền cử tri, giao dịch bị từ chối với lỗi `NotAdmin()`.
- **E2 (Chưa được cấp quyền):** Nếu ví chưa được Admin cấp quyền cử tri gọi hàm `vote()`, giao dịch bị từ chối với lỗi `NotEligible()`.
- **E3 (Bỏ phiếu lặp):** Nếu cử tri đã bỏ phiếu cố tình gọi hàm `vote()` lần thứ 2, giao dịch bị từ chối với lỗi `AlreadyVoted()`.
- **E4 (Quá hạn bỏ phiếu):** Nếu cử tri gọi hàm `vote()` sau mốc `endTime`, giao dịch bị từ chối với lỗi `NotInVotingPeriod()`.
- **E5 (Bầu sai ứng viên):** Nếu cử tri nhập `candidateId` không tồn tại, giao dịch bị từ chối với lỗi `InvalidCandidate()`.

## 6. Ngoài phạm vi
- Chưa hỗ trợ cơ chế rút lại hoặc thay đổi phiếu bầu sau khi đã xác nhận.
- Chưa tích hợp hệ thống xác thực danh tính sinh viên bằng Căn cước công dân hoặc Email nội bộ trường (chỉ định danh qua địa chỉ ví).
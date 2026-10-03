# SPEC — HỆ THỐNG BỎ PHIẾU BẦU CỬ ON-CHAIN (CLUB VOTING)

## 1. Mục đích
Hệ thống cho phép cử tri sinh viên bỏ phiếu minh bạch cho các ứng viên ban cán sự trên blockchain Ethereum Sepolia; kết quả tự động thống kê công khai và không thể can thiệp sửa đổi.

## 2. Đầu vào
- `names` (string[]): Danh sách tên ứng cử viên khởi tạo lúc triển khai hợp đồng.
- `durationMinutes` (uint256): Thời hạn mở hòm phiếu tính bằng phút.
- `voters` (address[] calldata): Danh sách địa chỉ ví cử tri hợp lệ do Admin đăng ký.
- `candidateId` (uint256): Số thứ tự định danh của ứng cử viên được bầu.

## 3. Quy tắc nghiệp vụ
- **R1 (Quyền hạn hòm phiếu):** Chỉ địa chỉ Admin (chủ tọa) mới có quyền gọi hàm `registerVoters` để thêm danh sách cử tri.
- **R2 (Thời hạn hợp lệ):** Giao dịch bỏ phiếu `vote(candidateId)` chỉ được chấp nhận khi `block.timestamp >= startTime` và `block.timestamp <= endTime`.
- **R3 (Chống bỏ phiếu kép):** Mỗi địa chỉ ví chỉ được bỏ phiếu duy nhất 1 lần; biến trạng thái `hasVoted[msg.sender]` phải chuyển sang `true` trước khi tăng số phiếu (tuân thủ Checks-Effects-Interactions).
- **R4 (Công khai kết quả):** Bất kỳ ai cũng có thể gọi hàm `getResults()` miễn phí (view function) để tra cứu tổng số phiếu thời gian thực mà không mất phí gas.

## 4. Đầu ra
- Trạng thái `hasVoted` được cập nhật vào Storage;
- Số phiếu `voteCount` của ứng cử viên tăng lên 1;
- Phát sự kiện on-chain: `event Voted(address indexed voter, uint256 indexed candidateId)`.

## 5. Trường hợp ngoại lệ
- **E1 (Bỏ phiếu lặp):** Nếu ví đã bầu cố tình gọi lại hàm `vote` -> Hệ thống Revert với mã lỗi tùy biến `error AlreadyVoted()`.
- **E2 (Ngoài thời gian):** Nếu gọi hàm khi chưa mở hòm phiếu hoặc đã hết hạn -> Hệ thống Revert với lỗi `error NotInVotingPeriod()`.
- **E3 (Ví không thuộc danh sách):** Nếu ví chưa được Admin cấp quyền gọi hàm `vote` -> Hệ thống Revert với lỗi `error NotEligible()`.
- **E4 (Ứng viên không tồn tại):** Nhập `candidateId >= candidates.length` -> Hệ thống Revert với lỗi `error InvalidCandidate()`.

## 6. Ngoài phạm vi
- Chưa tích hợp cơ chế mật mã che giấu lá phiếu (Zero-Knowledge / Commit-Reveal);
- Không hỗ trợ ủy quyền phiếu bầu (Voting Delegation).

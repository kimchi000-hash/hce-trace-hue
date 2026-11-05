# TỰ RÀ SOÁT — ProjectCore.sol (theo danh mục 10 hạng mục của Lab 14)

- **Đối tượng:** [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol), 313 dòng, Solidity 0.8.20.
- **Cách làm:** đọc từng hàm theo bảng 10 hạng mục của sổ tay; mỗi kết luận trích số dòng và test. Công cụ AI (Claude) hỗ trợ đọc mã và chạy test; kết luận do nhóm xem lại (xem `AI_JOURNAL.md`).
- **Phân biệt:** đây là **tự** rà soát. Báo cáo do nhóm khác viết về hợp đồng của nhóm được xử lý ở mục 4; báo cáo hiện có trong [`AUDIT_REPORT.md`](AUDIT_REPORT.md) là bản rà soát hợp đồng của nhóm VotaChain (không phải về hợp đồng này).

## Tóm tắt

Phát hiện **1 lỗi thật đã sửa** (TB4), **4 điểm yếu thiết kế** chấp nhận có điều kiện (TB1, TB2, TB3, TB5), không có lỗ hổng nghiêm trọng về khóa tiền hay đổi kết quả sau khi bỏ phiếu. Hợp đồng không giữ ETH, không gọi hợp đồng ngoài, không có quyền quản trị toàn cục.

## 1. Danh mục 10 hạng mục

| # | Hạng mục | Kết luận | Bằng chứng (dòng) |
| :-: | :--- | :---: | :--- |
| 1 | **Phân quyền** | Đạt | Không có hàm đặc quyền toàn cục. `approveElection` kiểm tra `isApprover` (dòng 180) và `hasApproved` (181). `commit` kiểm tra bằng chứng Merkle gắn `msg.sender` (203–205). `reveal` đọc/ghi theo `msg.sender` (218, 225) nên không ai mở thay người khác. `createElection` mở cho mọi người **có chủ đích** (ai cũng tổ chức được; quyền lực bị giới hạn ở mục 3 Economic Rules). Test: nhóm B, E |
| 2 | **Thứ tự thao tác** | Đạt | Không có chuyển ETH hay gọi ngoài. Trong `reveal`: kiểm tra (219–222) → ghi `REVEALED`, tăng phiếu (225–227) → phát sự kiện (228). `commit`: kiểm tra → ghi (209) → sự kiện (210). Test: nhóm D |
| 3 | **Điều kiện thời gian** | Đạt | `phase()` dùng `<=` (234–236): đúng giây `regEnd/commitEnd/revealEnd` vẫn thuộc pha cũ. Mốc cố định, không có công tắc thủ công. Test biên: nhóm G ("duyệt DUOC ở giây regEnd, KHÔNG ở regEnd + 1", tương tự `commitEnd`). `block.timestamp` có thể lệch vài giây theo thợ đào, không ảnh hưởng vì mốc tính bằng phút |
| 4 | **Phép chia** | Đạt, **1 lỗi tràn số đã sửa** | Không có phép chia; quorum so sánh bằng nhân (`revealedCount × 10000 ≥ voterCount × quorumBps`, dòng 247). Phép nhân với `voterCount` do người tạo tự đặt có thể tràn → xem **TB4** |
| 5 | **Cách chuyển ETH** | Không áp dụng | Hợp đồng không có `payable`, `receive` hay `fallback`; ETH gửi thẳng vào bị từ chối. Không có `transfer`/`call{value}` |
| 6 | **Dữ liệu riêng tư** | Đạt có điều kiện | `commitments` công khai nhưng là mã băm. Phiếu **được lộ có chủ đích** khi cử tri mở: sự kiện `Revealed(id, voter, candidateId)` (228) liên kết ví với ứng viên mãi mãi → xem **TB3, TB5**. Băm `id‖candidateId‖salt‖msg.sender` (222) không bị nhập nhằng đóng gói: `salt` là chuỗi duy nhất có độ dài thay đổi và đứng trước trường 20 byte cuối, nên kẻ khác không dựng được cùng đầu vào băm bằng địa chỉ của mình |
| 7 | **Vòng lặp** | Đạt | Mọi vòng lặp bị chặn: ứng viên ≤ 20 (dòng 128, 144, 252), người duyệt ≤ 10 (168). Vòng Merkle (dòng 9) chạy theo độ dài bằng chứng do chính người gọi gửi, chi phí do họ trả. `unchecked { ++i; }` chỉ ở biến đếm có `i < n` |
| 8 | **Sự kiện** | Đạt | Mọi hàm đổi trạng thái đều phát sự kiện: `ElectionCreated` (135), `ElectionApproved` (186), `ElectionActivated` (190), `Committed` (210), `Revealed` (228) |
| 9 | **Trường hợp số 0** | Đạt | `names < 2`, `voterCount == 0`, `merkleRoot == 0`, `regMinutes/commitMinutes/revealMinutes == 0`, `approvers == 0`, `requiredApprovals == 0`, `commitment == 0` đều bị `InvalidParams` (140–163, 206). Không ai mở phiếu + `quorumBps = 0` → vẫn `valid=false` vì `topVotes == 0`. Test: nhóm A, C, F |
| 10 | **Địa chỉ rỗng** | Đạt | `approvers` chứa `address(0)` bị `InvalidParams` (170). Cử tri `address(0)` không có bằng chứng hợp lệ trong thực tế (và không ai ký bằng khóa của nó). `scripts/merkle.js` từ chối `0x0` khi dựng cây. Test: nhóm A, H |

## 2. Phát hiện và xử lý

### TB4 — `voterCount` quá lớn làm `result()` revert vĩnh viễn · **Trung bình · ĐÃ SỬA**
- **Vị trí:** `createElection` / `_validate` (dòng 156) và `result` (dòng 247).
- **Mô tả:** `voterCount` do người tạo tự đặt, chỉ bị chặn `== 0`. Giá trị như `2²⁵⁶−1` làm phép `voterCount × quorumBps` trong `result()` tràn số; Solidity 0.8 revert với `Panic(0x11)`.
- **Hậu quả:** sau khi cuộc bầu cử kết thúc, không ai gọi được `result()` (số phiếu vẫn đọc được bằng `getVotes`). Không mất tiền, nhưng kết quả chính thức không đọc được và hợp đồng không sửa được.
- **Cách sửa:** thêm `MAX_VOTERS = 1 000 000` (dòng 68) và từ chối `voterCount` lớn hơn bằng `InvalidParams` (156). Test mới: nhóm A (hai ca `voterCount` vượt trần và `2²⁵⁶−1`; một ca biên `voterCount = MAX_VOTERS` với quorum 100% vẫn đọc được `result()`).
- **Ai phát hiện:** công cụ AI khi đi hạng mục 4; nhóm đã xác nhận bằng test.

### TB1 — `voterCount` không kiểm chứng được trên chuỗi · **Trung bình · CHẤP NHẬN CÓ ĐIỀU KIỆN**
- Merkle root không cho biết số lá. Ban tổ chức khai nhỏ hơn thực tế sẽ hạ ngưỡng quorum (ví dụ danh sách 100 người nhưng khai 10: chỉ cần 5 người mở phiếu là đủ 50%).
- **Giảm thiểu:** người duyệt phải tự dựng lại root từ danh sách công bố, đếm lá, đối chiếu `voterCount` trước khi ký (ghi trong SPEC mục 6, ECONOMIC U4). Sửa triệt để cần chứng minh số lá hoặc đưa danh sách lên chuỗi (tốn gas, đổi thiết kế), ngoài phạm vi.

### TB2 — Người duyệt có thể là ví giả do ban tổ chức điều khiển · **Trung bình · CHẤP NHẬN**
- Dòng 170 chỉ chặn `approver == msg.sender` của người tạo, không chứng minh được hai ví khác nhau thuộc hai người khác nhau.
- **Giảm thiểu:** công bố địa chỉ người duyệt (`getApprovers`) cùng danh tính; chọn giảng viên/cố vấn làm người duyệt.

### TB3 — Thấy tỷ số trong pha Reveal rồi mới quyết định mở phiếu · **Thấp · CHẤP NHẬN**
- `getVotes` và sự kiện `Revealed` công khai theo thời gian thực, nên cử tri đến sau có thể bỏ phiếu chiến lược (không mở phiếu nếu phe mình đã thua/thắng). Hợp đồng chỉ đảm bảo bí mật **đến lúc từng người tự mở phiếu**.
- **Giảm thiểu:** pha Reveal ngắn; nêu rõ trong SPEC mục 6.

### TB5 — Phiếu không ẩn danh sau khi mở · **Thấp · CHẤP NHẬN (thuộc yêu cầu của đề tài)**
- Liên kết ví–ứng viên công khai vĩnh viễn sau `reveal`. Đây là hệ quả của commit–reveal đơn giản, không phải lỗi; nếu cần ẩn danh thật thì phải dùng ZK (ngoài phạm vi).

## 3. Cái không phải lỗi nhưng cần hiểu (câu hỏi vấn đáp thường gặp)

- **Vì sao băm có `msg.sender` và `id`?** Chặn chép cam kết của người khác và phát lại giữa các cuộc bầu cử (test nhóm E).
- **Vì sao `salt` là `string`?** Cho phép salt dễ lưu/ghi lại; giao diện sinh 32 byte ngẫu nhiên dạng chuỗi hex. Lưu ý: kiểu `string` không giới hạn độ dài, người dùng tự chịu gas calldata.
- **Vì sao không có `isVoter` mapping?** Danh sách đưa lên chuỗi tốn gas theo số cử tri; Merkle root cố định 32 byte, cử tri tự nộp bằng chứng khi bỏ phiếu.
- **Vì sao `REVEALED` ghi đè `commitments`?** Tiết kiệm ≈ 19,5 nghìn gas mỗi lần mở phiếu (xem `GAS_REPORT.md`); đổi lại phải chặn `commitment == REVEALED` ở `commit` (dòng 206).
- **Hợp đồng vượt 150 dòng của bộ lọc phạm vi** (313 dòng, trong đó gồm thư viện Merkle). Nhóm biết rõ và xin điều chỉnh phạm vi (xem `GATE_REVIEW_1.md`, phụ lục).

## 4. Báo cáo rà soát chéo nhận được từ nhóm khác (Lab 14)

> **Chưa có.** Theo sổ tay, nhóm được ghép vòng tròn sẽ viết báo cáo về `ProjectCore.sol` của nhóm này. Khi nhận, lưu thành `docs/AUDIT_REPORT.md` (thay bản hiện có) hoặc giữ cả hai tên, rồi điền bảng bên dưới và commit `lab-14: xu ly ket qua audit cheo`.

| # | Phát hiện của nhóm bạn | Mức độ | Phản hồi của nhóm (sửa / chấp nhận + lý do) | Commit sửa |
| :-: | :--- | :-: | :--- | :--- |
| | *(điền sau khi nhận báo cáo)* | | | |

## 5. Cách tái lập mọi khẳng định ở trên

```bash
npm install
npx hardhat test       # 77 ca: 72 ca hợp đồng và Merkle + 5 ca đối chiếu ABI
```

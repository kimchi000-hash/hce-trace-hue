# ĐẶC TẢ YÊU CẦU NGHIỆP VỤ (SPECIFICATION) — CLUB VOTING V2.0
## Hệ thống Bầu cử Kín 2 pha (Commit - Reveal) kết hợp Quorum (Basis Points)

- **Học phần:** ECO2432 — Web3 Starter
- **Hợp đồng áp dụng:** [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol)
- **Nhóm thực hiện:**
  - Nguyễn Thị Kim Chi (23K4300025) — Đặc tả (BA) & Smart Contract Dev
  - Võ Thị Thư (23K4300038) — Tester & Frontend

---

## 1. Mục đích & Bối cảnh Nâng cấp
Hệ thống bầu cử ban cán sự lớp / CLB phiên bản v2.0 nâng cấp toàn diện cơ chế bỏ phiếu nhằm khắc phục hoàn toàn nhược điểm lộ thông tin bầu cử trên mạng blockchain công khai:
- **Bảo mật tuyệt đối ý đồ bầu cử (Secret Ballot):** Ứng dụng kỹ thuật Mật mã hóa 2 pha **Commit - Reveal**, đảm bảo không ai biết trước cử tri bầu cho ai cho đến khi hết hạn nộp phiếu.
- **Chống sao chép phiếu & Tấn công Front-running (Copy-voting Defense):** Ràng buộc trực tiếp địa chỉ ví của cử tri (`msg.sender`) vào hàm băm `keccak256`.
- **Ràng buộc ngưỡng túc số (Quorum Threshold):** Chuẩn hóa tỷ lệ tham gia tối thiểu bằng **Basis Points (bps)**, ngăn ngừa tình trạng thiểu số thao túng cuộc bầu cử.
- **Tính toán người chiến thắng tự động & Xử lý hòa phiếu:** Tự động phát hiện trường hợp bằng phiếu hoặc không đạt túc số để vô hiệu hóa kết quả một cách khách quan.

---

## 2. Các Pha Bầu cử & Cấu trúc Dữ liệu

### 2.1 Chu trình 4 Pha Bầu cử (`enum Phase`)
Hợp đồng quản lý chu kỳ sống (lifecycle) tự động theo mốc thời gian khối (`block.timestamp`):
```solidity
enum Phase { Registration, Commit, Reveal, Ended }
```
1. **Pha 0 — `Registration` ($\text{block.timestamp} \le \text{regEnd}$):** Quản trị viên nạp danh sách cử tri sinh viên hợp lệ theo lô. Cổng bầu cử chưa mở.
2. **Pha 1 — `Commit` ($\text{regEnd} < \text{block.timestamp} \le \text{commitEnd}$):** Cử tri nộp mã băm bí mật (`commitment`). Không ai có thể giải mã lá phiếu.
3. **Pha 2 — `Reveal` ($\text{commitEnd} < \text{block.timestamp} \le \text{revealEnd}$):** Cử tri công khai lá phiếu và mã khóa ngẫu nhiên (`salt`) để hợp đồng đối soát và ghi nhận số phiếu.
4. **Pha 3 — `Ended` ($\text{block.timestamp} > \text{revealEnd}$):** Khóa sổ toàn diện. Hợp đồng mở hàm `result()` để xác định người chiến thắng hợp lệ.

### 2.2 Hằng số & Biến trạng thái cốt lõi
- `MAX_CANDIDATES = 20`: Khống chế tối đa 20 ứng cử viên, bảo vệ giới hạn tính toán lặp khi duyệt kết quả.
- `MAX_BATCH = 200`: Giới hạn danh sách cử tri tối đa 200 địa chỉ ví trong mỗi lần gọi `registerVoters` nhằm chống vượt trần Block Gas Limit.
- `quorumBps`: Ngưỡng cử tri tối thiểu tính theo basis point ($1\% = 100 \text{ bps}$, ví dụ: $5,000 \text{ bps} = 50.00\%$).
- `voterCount`: Tổng số lượng cử tri hợp lệ duy nhất được cấp quyền trong pha Registration.
- `revealedCount`: Tổng số cử tri đã tiết lộ lá phiếu thành công trong pha Reveal.
- `candidates` (`string[]`): Danh sách tên các ứng cử viên ($2 \le \text{names.length} \le 20$).
- `votes` (`uint256[]`): Mảng đếm số phiếu tương ứng của từng ứng cử viên.
- `isVoter` (`mapping(address => bool)`): Danh sách cử tri hợp lệ.
- `commitments` (`mapping(address => bytes32)`): Lưu trữ mã băm bí mật của từng cử tri.
- `hasRevealed` (`mapping(address => bool)`): Đánh dấu trạng thái cử tri đã mở phiếu thành công.

---

## 3. Bộ 5 Quy tắc Nghiệp vụ Cốt lõi (Core Business Rules)

### R1 — Phân quyền Cử tri & Ràng buộc Pha Đăng ký (`Registration`)
- Chỉ địa chỉ ví được kích hoạt trong danh sách cử tri (`isVoter[voter] == true`) mới có quyền tham gia bỏ phiếu.
- Việc đăng ký chỉ được phép thực hiện trong pha `Registration` (`inPhase(Phase.Registration)`). Một khi đã chuyển sang pha `Commit`, Admin **hoàn toàn không thể thêm người giữa chừng**, loại bỏ triệt để nguy cơ bơm thêm ví ảo khi cuộc bầu cử đang diễn ra.
- Mỗi lô nạp danh sách không được vượt quá `MAX_BATCH` (200 địa chỉ). Bỏ qua các địa chỉ trùng lặp và từ chối địa chỉ rỗng `address(0)` với lỗi `InvalidParams()`.

### R2 — Pha 1: Cam kết Bí mật Lá phiếu (`Commit`)
- Trong pha `Commit`, cử tri chỉ gửi lên chuỗi một giá trị băm duy nhất:
  $$\text{commitment} = \text{keccak256}(\text{abi.encodePacked}(\text{candidateId}, \text{salt}, \text{msg.sender}))$$
  Trong đó `salt` là một chuỗi ngẫu nhiên 32-byte (`bytes32`) do cử tri tự sinh ra và lưu giữ bí mật ngoại chuỗi.
- Nhờ đặc tính một chiều của hàm băm Keccak-256, không ai (kể cả Admin, thợ đào hay đối thủ) có thể đọc được cử tri đang bầu cho ai.
- Mỗi cử tri chỉ được nộp mã băm đúng 1 lần duy nhất; nếu gọi lại sẽ bị hoàn tác với lỗi `AlreadyCommitted()`.

### R3 — Pha 2: Tiết lộ Phiếu & Chống Sao chép Phiếu (`Reveal`)
- Trong pha `Reveal`, cử tri thực hiện công khai lá phiếu bằng cách gọi hàm `reveal(candidateId, salt)`.
- Hợp đồng tái tạo lại mã băm và đối soát trực tiếp:
  $$\text{keccak256}(\text{abi.encodePacked}(\text{candidateId}, \text{salt}, \text{msg.sender})) \stackrel{?}{=} \text{commitments}[\text{msg.sender}]$$
- **Cơ chế chống sao chép phiếu (Anti Copy-Voting):** Nhờ tham số `msg.sender` được đóng gói bên trong mã băm, kẻ xấu không thể sao chép chuỗi `commitment` của người khác để nộp lại. Nếu kẻ xấu dùng ví khác để mở phiếu, hàm băm sẽ không khớp và bị từ chối với lỗi `BadReveal()`.
- **Mô hình Checks-Effects-Interactions (CEI):** Trạng thái `hasRevealed[msg.sender] = true;` được ghi nhận trước khi cộng dồn phiếu `votes[candidateId] += 1` và tăng biến đếm `revealedCount += 1`.

### R4 — Ngưỡng Túc số Bắt buộc bằng Điểm cơ bản (Quorum via Basis Points)
- Kết quả bầu cử chỉ được xem là hợp lệ khi số cử tri hoàn tất tiết lộ phiếu (`revealedCount`) đạt tỷ lệ tối thiểu `quorumBps` trên tổng số cử tri (`voterCount`):
  $$\text{revealedCount} \times 10,000 \ge \text{voterCount} \times \text{quorumBps}$$
  *(Ví dụ: Với $\text{quorumBps} = 5,000$, nếu lớp có 60 sinh viên thì tối thiểu 30 sinh viên phải tiết lộ phiếu).*
- Nếu không đạt ngưỡng Quorum này, cuộc bầu cử bị xem là thất bại và hàm `result()` sẽ trả về `(valid = false, winnerId = 0, topVotes = 0)`.

### R5 — Khóa sổ & Tự động Xử lý Hòa phiếu (`Ended`)
- Khi hết thời gian pha Reveal, hợp đồng tự động chuyển sang pha `Ended`.
- Hàm `result()` duyệt qua mảng phiếu bầu để tìm ứng viên có số phiếu cao nhất (`topVotes`):
  - Nếu có từ 2 ứng cử viên trở lên có cùng số phiếu cao nhất (`tied > 1`), không thể xác định người chiến thắng duy nhất.
  - Nếu không có ai bỏ phiếu hoặc không ai tiết lộ phiếu (`topVotes == 0`).
  $\Rightarrow$ Trong cả hai trường hợp trên, hàm `result()` trả về `valid = false`.
- Kết quả chỉ được công nhận `valid = true` khi và chỉ khi: Đạt đủ Quorum **VÀ** có duy nhất 1 ứng cử viên dẫn đầu (`tied == 1 && topVotes > 0`).

---

## 4. Đặc tả Giao diện & Mã lỗi Tùy biến (Custom Errors)

### 4.1 Danh mục Sự kiện (Events)
- `event VoterRegistered(address indexed voter);`: Phát ra khi cử tri được thêm vào Whitelist.
- `event Committed(address indexed voter);`: Phát ra khi cử tri nộp mã băm bí mật thành công.
- `event Revealed(address indexed voter, uint256 indexed candidateId);`: Phát ra khi cử tri mở phiếu thành công.

### 4.2 Danh mục Lỗi tùy biến (Custom Errors)
| Tên Lỗi | Điều kiện phát sinh | Ý nghĩa an ninh |
| :--- | :--- | :--- |
| `NotAdmin()` | Người gọi hàm `registerVoters` không phải là `admin` | Bảo vệ quyền quản trị |
| `WrongPhase(Phase current)` | Gọi hàm không đúng với pha hiện tại của hợp đồng | Kiểm soát chặt chẽ quy trình thời gian |
| `NotEligible()` | Ví gọi `commit()` không nằm trong danh sách `isVoter` | Chống xâm nhập và cử tri không hợp lệ |
| `AlreadyCommitted()` | Cử tri cố tình gửi lại `commitment` lần 2 | Chống thay đổi ý định trong pha cam kết |
| `NoCommitment()` | Cử tri gọi `reveal()` nhưng chưa từng nộp mã băm | Chặn cử tri chưa qua pha Commit |
| `AlreadyRevealed()` | Cử tri cố tình mở phiếu lần thứ 2 | Chống tăng số phiếu nhiều lần |
| `BadReveal()` | Mã băm từ `(candidateId, salt, msg.sender)` không khớp | Chặn gian lận, tráo phiếu hoặc sai khóa |
| `InvalidCandidate()` | `candidateId >= candidates.length` | Chặn bỏ phiếu cho ứng viên không tồn tại |
| `InvalidParams()` | Tham số đầu vào không hợp lệ (địa chỉ 0, danh sách rỗng, bps > 10,000) | Bảo vệ tính toàn vẹn tham số |
| `BatchTooLarge()` | Mảng `voters.length > MAX_BATCH` (200 ví) | Chống vượt trần Block Gas Limit |

---

## 5. Ngoài phạm vi phiên bản v2.0
- Chưa áp dụng ZK-SNARKs để tự động xác thực phiếu kín mà không cần pha Reveal thứ 2 (dự kiến nghiên cứu ở các giai đoạn sau).
- Việc lưu trữ `salt` do người dùng tự quản lý trên Frontend hoặc ghi chép cá nhân. Nếu người dùng làm mất `salt`, lá phiếu sẽ không thể mở ở pha Reveal và không được tính vào kết quả.
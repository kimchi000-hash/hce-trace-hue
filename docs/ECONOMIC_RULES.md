# QUY TẮC KINH TẾ VÀ QUẢN TRỊ DÒNG ĐIỀU KHIỂN (ECONOMIC RULES & GOVERNANCE) — V2.0
## Đề tài: Hệ thống Bầu cử Kín 2 pha (Commit - Reveal) kết hợp Quorum (Basis Points)

- **Học phần:** ECO2432 — Web3 Starter
- **Hợp đồng áp dụng:** [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol)
- **Nhóm thực hiện:**
  - Nguyễn Thị Kim Chi (23K4300025) — Đặc tả (BA) & Smart Contract Dev
  - Võ Thị Thư (23K4300038) — Tester & Frontend

---

## 1. Tổng quan mô hình kinh tế (Economic Model Overview)

### 1.1 Cơ chế Khuyến khích & Bảo mật Ý đồ Bầu cử
- **Loại bỏ hiệu ứng tâm lý đám đông (Anti-Bandwagon Effect):** 
  - Trong mô hình bầu cử mở (v1.0), số phiếu hiển thị tức thời khiến cử tri bầu sau bị ảnh hưởng bởi xu hướng dẫn đầu hoặc chịu áp lực xã hội/hối lộ.
  - Mô hình bầu cử kín 2 pha (**Commit - Reveal**) giải quyết triệt để bài toán này: Lá phiếu được mã hóa bằng hàm băm mật mã học trong suốt thời gian nhận phiếu, bảo đảm sự độc lập và công bằng tuyệt đối cho mọi quyết định.
- **Bài toán chi phí giao dịch 2 pha (Two-Phase Gas Cost):**
  - Cử tri cần thực hiện 2 giao dịch trên chuỗi: 1 lệnh `commit(bytes32)` và 1 lệnh `reveal(uint256, bytes32)`.
  - Cả 2 giao dịch đều có mức tiêu thụ gas cực thấp (~35,000–50,000 gas), tổng chi phí trên Layer-2 (Arbitrum/Optimism/Base) dưới $0.006 USD, hoàn toàn phù hợp với mô hình CLB sinh viên.
  - Trên mạng Sepolia Testnet của trường, sinh viên được tài trợ faucet miễn phí hoàn toàn.

---

## 2. Bộ 5 Quy tắc Cốt lõi (Core Economic & Governance Rules)

### R1 — Phân quyền Cử tri & Đóng băng Danh sách theo Pha
- **Thời hạn đăng ký cố định:** Admin chỉ có thể nạp danh sách cử tri hợp lệ (`registerVoters`) trong pha `Registration` ($\text{block.timestamp} \le \text{regEnd}$).
- **Đóng băng quyền lực (Admin Freeze):** Ngay khi bước sang pha `Commit`, hàm `registerVoters` bị khóa vĩnh viễn (`WrongPhase`). Admin **hoàn toàn không thể bổ sung thêm ví mới giữa chừng**, loại bỏ rủi ro admin gian lận bơm thêm ví khi thấy ứng viên của mình bất lợi.
- **Khống chế trần xử lý lô (`MAX_BATCH = 200`):** Mỗi lần nạp chỉ tối đa 200 địa chỉ ví để đảm bảo không vượt quá Block Gas Limit của mạng (30,000,000 gas). Bỏ qua ví trùng để bảo toàn tính toàn vẹn của biến đếm `voterCount`.

### R2 — Pha 1 (Commit): Cam kết Bí mật Tuyệt đối trên Chuỗi
- **Mã hóa lá phiếu ngoại chuỗi:** Cử tri nộp mã băm:
  $$\text{commitment} = \text{keccak256}(\text{abi.encodePacked}(\text{candidateId}, \text{salt}, \text{msg.sender}))$$
- **Bảo mật trạng thái:** Lưu trữ dưới dạng `bytes32` trong mapping `commitments[msg.sender]`. Không có bất kỳ dữ liệu nào về `candidateId` được giải mã trên blockchain hoặc mempool trong suốt pha này.
- **Giới hạn 1 cam kết duy nhất:** Cử tri chỉ được nộp một mã băm duy nhất (`AlreadyCommitted`), ngăn ngừa việc gửi nhiều cam kết gây nhiễu loạn dữ liệu.

### R3 — Pha 2 (Reveal): Tiết lộ Hợp thức & Chống Sao chép Phiếu (Anti Copy-Voting)
- **Ràng buộc danh tính ví (`msg.sender`):** Mã băm bắt buộc chứa `msg.sender`. Nhờ đó:
  - Nếu một kẻ tấn công sao chép chuỗi băm của người khác để nộp trong pha Commit, đến pha Reveal khi gọi từ ví của hắn, hàm `keccak256` sẽ trả về giá trị khác và bị từ chối ngay lập tức với lỗi `BadReveal()`.
  - Không ai có thể "bầu theo" hoặc mạo danh phiếu của người khác.
- **Tuân thủ mô hình Checks-Effects-Interactions (CEI):** Đánh dấu `hasRevealed[msg.sender] = true;` trước khi ghi nhận cộng phiếu `votes[candidateId] += 1` và `revealedCount += 1`, loại bỏ triệt để rủi ro gọi lại (Reentrancy).

### R4 — Ràng buộc Ngưỡng Túc số (Quorum via Basis Points)
- **Quy chuẩn tỷ lệ Điểm cơ bản (Basis Points):** Tuân thủ chặt chẽ quy ước `AGENTS.md`, mọi tỷ lệ phần trăm đều dùng basis point ($1\% = 100 \text{ bps}$, $100\% = 10,000 \text{ bps}$).
- **Điều kiện Quorum hợp lệ:**
  $$\text{revealedCount} \times 10,000 \ge \text{voterCount} \times \text{quorumBps}$$
  *(Ví dụ: Với $\text{quorumBps} = 5000$, tức là tối thiểu 50.00% cử tri hợp lệ phải hoàn tất mở phiếu).*
- **Bảo vệ tính đại diện:** Nếu tỷ lệ mở phiếu $< \text{quorumBps}$, cuộc bầu cử bị xem là không đạt túc số (Quorum Failed). Kết quả không có giá trị pháp lý và hàm `result()` sẽ trả về `valid = false`.

### R5 — Khóa sổ & Thuật toán Xử lý Hòa phiếu Tự động (`Ended`)
- **Tự động chuyển pha khi hết hạn:** Khi `block.timestamp > revealEnd`, hợp đồng chuyển sang pha `Ended`.
- **Xác định người chiến thắng minh bạch:** Hàm `result()` duyệt mảng `votes` để tìm số phiếu cao nhất (`topVotes`):
  - Nếu có 2 ứng viên trở lên cùng đạt số phiếu cao nhất (`tied > 1`), không thể phân định người chiến thắng duy nhất.
  - Nếu chưa có phiếu nào được mở hợp lệ (`topVotes == 0`).
  $\Rightarrow$ Hợp đồng lập tức trả về `(valid = false, winnerId = 0, topVotes = 0)`.
- Chỉ khi đạt Quorum **VÀ** có duy nhất một ứng viên đứng đầu (`tied == 1 && topVotes > 0`) thì mới trả về `valid = true` kèm theo `winnerId` và `topVotes`.

---

## 3. Kịch bản Quản trị rủi ro & Ngăn chặn Gian lận

### 3.1 Rủi ro Cử tri không Tiết lộ Phiếu (Unrevealed Votes)
- **Kịch bản:** Cử tri nộp `commit` ở Pha 1 nhưng cố tình hoặc vô ý không gọi `reveal` ở Pha 2 (ví dụ: làm mất chuỗi `salt`, hoặc thấy xu hướng không như ý muốn nên bỏ cuộc).
- **Cách thức xử lý của hệ thống:**
  - Phiếu không được `reveal` sẽ vĩnh viễn không được cộng vào `votes` và không tính vào `revealedCount`.
  - Nếu quá nhiều cử tri không reveal khiến `revealedCount` không đạt `quorumBps`, toàn bộ kết quả bầu cử sẽ bị hủy bỏ (`valid = false`). Điều này tạo động lực kinh tế-xã hội buộc các nhóm cử tri phải nhắc nhở nhau hoàn tất nghĩa vụ bầu cử.

### 3.2 Hạn chế tối đa Đặc quyền của Admin (Least Privilege)
- Admin chỉ có quyền trong pha khởi tạo (`constructor`) và pha đăng ký cử tri (`registerVoters`).
- Admin không thể:
  - Can thiệp vào mảng `commitments` hay giải mã trước kết quả.
  - Ngăn cản cử tri hợp lệ thực hiện `reveal`.
  - Thay đổi mốc thời gian hoặc ép buộc ứng viên nào thắng cuộc.
  - Dùng hàm `pause()` đơn phương (hợp đồng không thiết kế hàm `pause` để bảo đảm tính trung lập của mã nguồn).

---

## 4. Bảng đo lường Ngân sách Gas dự kiến (V2.0)

| Thao tác nghiệp vụ | Hàm thực thi | Pha áp dụng | Gas ước tính | Chi phí Sepolia ETH | Chi phí quy đổi Layer-2 ($) |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Triển khai hợp đồng** | `constructor` (3 ứng viên, quorum 50%) | — | ~620,000 gas | 0.00124 ETH | ~$0.035 |
| **Đăng ký cử tri theo lô** | `registerVoters` (50 ví/lô) | `Registration` | ~1,150,000 gas | 0.00230 ETH | ~$0.045 |
| **Pha 1: Nộp cam kết bí mật** | `commit(bytes32)` | `Commit` | ~44,500 gas | 0.000089 ETH | ~$0.002 |
| **Pha 2: Mở lá phiếu** | `reveal(uint256, bytes32)` | `Reveal` | ~49,200 gas | 0.000098 ETH | ~$0.003 |
| **Đọc kết quả bầu cử** | `result()` (View call) | `Ended` | 0 gas | 0 ETH | Miễn phí |

---

## 5. Bảng giải trình 5 Phản biện Kinh tế & Kỹ thuật của AI (V2.0)

| STT | Luận điểm phản biện của AI | Phân tích rủi ro | Phương án giải trình & Khắc phục của Nhóm |
| :---: | :--- | :--- | :--- |
| **1** | **Rủi ro lộ bí mật phiếu bầu:** Liệu việc công khai giao dịch trên blockchain có làm lộ lựa chọn của cử tri không? | Áp lực xã hội, thao túng tâm lý bầu cử nếu lộ kết quả sớm. | Áp dụng cơ chế **Commit - Reveal 2 pha**. Lá phiếu chỉ nộp dưới dạng mã băm Keccak-256 ở pha Commit, giải mật hoàn toàn nguy cơ lộ ý định trước giờ kết thúc. |
| **2** | **Tấn công sao chép phiếu (Copy-voting / Front-running):** Cử tri lười suy nghĩ có thể copy mã băm của cử tri uy tín trong mempool để nộp theo. | Kết quả bị thiên lệch do sao chép hàng loạt mà không có chủ ý. | Hàm băm ràng buộc chặt chẽ địa chỉ ví `msg.sender` (`keccak256(candidateId, salt, msg.sender)`). Kẻ sao chép nộp chuỗi băm của người khác sẽ bị lỗi `BadReveal()` khi mở phiếu từ ví của hắn. |
| **3** | **Quên khóa `salt` dẫn đến mất phiếu:** Cử tri làm mất chuỗi `salt` ngoại chuỗi thì sao? | Cử tri mất quyền biểu quyết hợp lệ. | Được giải quyết ở tầng Frontend/DApp: Tự động mã hóa và lưu trữ `salt` vào LocalStorage hoặc cho phép người dùng tải file dự phòng JSON an toàn khi ấn Commit. |
| **4** | **Rủi ro thiểu số thao túng khi ít người tham gia:** Nếu lớp có 60 người nhưng chỉ 3 người vote thì kết quả có giá trị không? | Thiếu tính đại diện cho tập thể lớp/CLB. | Bắt buộc kiểm tra ngưỡng túc số `quorumBps` (tính theo basis points). Nếu `revealedCount * 10,000 < voterCount * quorumBps`, hàm `result()` trả về `valid = false`. |
| **5** | **Tranh chấp khi hai ứng viên bằng phiếu:** Nếu hai người có cùng số phiếu cao nhất thì ai thắng? | Tranh chấp vị trí ban cán sự, không có quy tắc phân xử. | Hợp đồng tự động đếm biến `tied`. Nếu `tied > 1`, hàm `result()` trả về `valid = false`, yêu cầu Ban cố vấn tổ chức vòng bầu cử hiệp thương bổ sung. |

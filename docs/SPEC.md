# SPEC — CLUB VOTING (Bầu cử kín Commit–Reveal)

- **Học phần:** ECO2432 — Tiền điện tử & Hợp đồng thông minh
- **Hợp đồng:** [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol) (Solidity `^0.8.20`, biên dịch 0.8.20)
- **Phiên bản đặc tả:** v3.0 — khớp với mã nguồn hiện tại (bầu cử nhiều cuộc, Merkle, người duyệt). Thay thế v2.0 (một cuộc, `registerVoters`).
- **Nhóm:** Nguyễn Thị Kim Chi (23K4300025), Võ Thị Thư (23K4300038)

> Mọi tên hàm, lỗi, sự kiện trong tài liệu này được đối chiếu tự động với bản biên dịch (xem `test/web_abi.test.js`) và mỗi quy tắc R1–R8 có test tương ứng trong `test/ProjectCore.test.js` (cột "Kiểm chứng").

---

## 1. Mục đích

Cho phép một lớp hoặc câu lạc bộ **bầu ban cán sự bằng phiếu kín trên blockchain**: không ai thấy cử tri bầu cho ai trước khi chính cử tri mở phiếu, mỗi ví trong danh sách chỉ được một phiếu, và kết quả chỉ được công nhận khi đủ tỷ lệ tham gia (quorum) và có đúng một người dẫn đầu.

Người dùng: **ban tổ chức** (tạo cuộc bầu cử), **người duyệt** (xác nhận cuộc bầu cử hợp lệ), **cử tri** (nộp và mở phiếu), **người xem** (đọc kết quả).

---

## 2. Đầu vào

### 2.1 Tạo cuộc bầu cử — `createElection(NewElection p)` (do ban tổ chức gọi)

| Trường | Kiểu | Ai cung cấp | Ràng buộc (vi phạm → `InvalidParams()`) |
| :--- | :--- | :--- | :--- |
| `title` | `string` | Ban tổ chức | 1–120 byte |
| `names` | `string[]` | Ban tổ chức | 2–20 ứng viên; mỗi tên 1–64 byte |
| `regMinutes` | `uint256` | Ban tổ chức | 1 – 43 200 (30 ngày). Thời gian chờ người duyệt |
| `commitMinutes` | `uint256` | Ban tổ chức | 1 – 43 200. Thời gian nộp phiếu kín |
| `revealMinutes` | `uint256` | Ban tổ chức | 1 – 43 200. Thời gian mở phiếu |
| `quorumBps` | `uint256` | Ban tổ chức | 0 – 10 000 (1% = 100 bps; 5000 = 50%) |
| `voterCount` | `uint256` | Ban tổ chức | 1 – 1 000 000 (`MAX_VOTERS`). Số cử tri **do ban tổ chức tự khai** (xem mục 6 và `SELF_AUDIT.md` TB1) |
| `merkleRoot` | `bytes32` | Ban tổ chức (sinh bằng `scripts/merkle.js`) | khác 0 |
| `approvers` | `address[]` | Ban tổ chức | 1–10 địa chỉ; khác 0, không trùng, **không được là người tạo** |
| `requiredApprovals` | `uint256` | Ban tổ chức | 1 – số người duyệt |

### 2.2 Các thao tác khác

| Hàm | Đầu vào | Người gọi |
| :--- | :--- | :--- |
| `approveElection(id)` | `id` cuộc bầu cử | Người duyệt đã đăng ký |
| `commit(id, commitment, merkleProof)` | `commitment = keccak256(abi.encodePacked(id, candidateId, salt, msg.sender))` (`salt` là `string`); `merkleProof` = bằng chứng ví nằm trong danh sách | Cử tri |
| `reveal(id, candidateId, salt)` | ID ứng viên và chính chuỗi `salt` đã dùng khi commit | Cử tri |
| `result(id)`, `phase(id)`, `get*` | `id` | Bất kỳ ai (hàm đọc, không tốn gas) |

**Danh sách cử tri** không nằm trên chuỗi: chỉ có `merkleRoot`. Lá cây = `keccak256(abi.encodePacked(address))`; cặp nút được sắp xếp; nút lẻ ở cuối tầng được đưa nguyên lên tầng trên (`scripts/merkle.js`).

---

## 3. Quy tắc nghiệp vụ

Mỗi quy tắc là một khẳng định kiểm tra được. Cột cuối là nhóm test chứng minh (`npx hardhat test`).

| # | Quy tắc | Kiểm chứng |
| :-: | :--- | :--- |
| **R1** | **Pha theo thời gian, không có công tắc thủ công.** `phase(id)` suy ra từ `block.timestamp`: `Registration` (≤ `regEnd`) → `Commit` (≤ `commitEnd`) → `Reveal` (≤ `revealEnd`) → `Ended`. Các mốc là `regEnd = tạo + regMinutes`, `commitEnd = regEnd + commitMinutes`, `revealEnd = commitEnd + revealMinutes` và **không đổi sau khi tạo**. Mốc biên: tại đúng giây `regEnd` vẫn là pha cũ, sau 1 giây là pha mới. | Nhóm G |
| **R2** | **Cuộc bầu cử chỉ có hiệu lực khi đủ chữ ký duyệt.** Chỉ người duyệt đăng ký mới gọi được `approveElection`, mỗi người một lần, **chỉ trong pha `Registration`**. Khi `approvalCount ≥ requiredApprovals` thì `isActivated = true`. Chưa kích hoạt thì `commit` bị từ chối (`ElectionNotActive`). Người tạo không thể tự làm người duyệt. | Nhóm B, E |
| **R3** | **Chỉ ví trong danh sách mới nộp được phiếu.** `commit` yêu cầu `merkleProof` hợp lệ cho `keccak256(msg.sender)` so với `merkleRoot`; sai → `InvalidProof`. Mỗi ví nộp **một lần** (`AlreadyCommitted`). `commitment` bằng 0 hoặc bằng giá trị đánh dấu nội bộ bị từ chối (`InvalidParams`). Chỉ nộp được trong pha `Commit`. | Nhóm C, E, H |
| **R4** | **Mở phiếu phải khớp cam kết.** `reveal` chỉ trong pha `Reveal`; ví phải đã commit (`NoCommitment`), chưa mở (`AlreadyRevealed`), `candidateId` hợp lệ (`InvalidCandidate`), và `keccak256(id, candidateId, salt, msg.sender)` phải bằng cam kết đã nộp (`BadReveal`). Thành công thì cộng đúng 1 phiếu, tăng `revealedCount`, phát `Revealed`. | Nhóm D, E |
| **R5** | **Chống sao chép và phát lại phiếu.** Băm có `msg.sender` (không dùng được cam kết của người khác) và có `id` (cam kết của cuộc bầu cử này vô dụng ở cuộc khác). | Nhóm E |
| **R6** | **Quorum bằng basis points.** Kết quả chỉ có thể hợp lệ khi `revealedCount × 10000 ≥ voterCount × quorumBps`. Bằng đúng ngưỡng vẫn đạt. Cam kết mà không mở phiếu **không** được tính vào quorum. | Nhóm F |
| **R7** | **Kết quả chỉ đọc được sau khi kết thúc và chỉ hợp lệ khi có đúng một người dẫn đầu.** `result(id)` chỉ gọi được ở pha `Ended` (`WrongPhase`). Trả về `valid = true` khi đạt quorum **và** đúng một ứng viên có số phiếu cao nhất > 0. Hòa nhất, không ai có phiếu, hoặc không đủ quorum → `(false, 0, 0)`. | Nhóm F |
| **R8** | **Nhiều cuộc bầu cử độc lập.** Mỗi `id` có dữ liệu riêng; phiếu và kết quả cuộc này không ảnh hưởng cuộc khác. Không có tài khoản quản trị toàn cục, không có hàm tạm dừng, không có hàm sửa cuộc bầu cử sau khi tạo. | Nhóm G |

**Sự kiện (mọi thay đổi trạng thái đều phát sự kiện):**
`ElectionCreated(id, admin, title)`, `ElectionApproved(id, approver)`, `ElectionActivated(id)`, `Committed(id, voter)`, `Revealed(id, voter, candidateId)`.

---

## 4. Đầu ra

| Đầu ra | Ở đâu | Nội dung |
| :--- | :--- | :--- |
| `createElection` → `id` | giá trị trả về, sự kiện `ElectionCreated` | ID tăng dần từ 0 (`electionCount`) |
| `phase(id)` | hàm đọc, giao diện `web/` | `Registration / Commit / Reveal / Ended` |
| `getElectionBasicInfo`, `getElectionStats` | hàm đọc, giao diện | admin, tên, đã kích hoạt, `merkleRoot`; các mốc thời gian, quorum, số cử tri, số đã mở phiếu, số chữ ký |
| `getCandidates`, `getVotes` | hàm đọc, giao diện | tên ứng viên; số phiếu (số phiếu chỉ tăng ở pha Reveal) |
| `getVoterStatus(id, voter)` | hàm đọc | `(committed, revealed)` |
| `result(id)` | hàm đọc, nút "Xem kết quả" | `(valid, winnerId, topVotes)` |
| Lỗi tùy biến | giao dịch bị revert; giao diện dịch sang tiếng Việt | xem mục 5 |
| Sự kiện | nhật ký giao dịch trên Etherscan | xem mục 3 |

Bảng lỗi và nghĩa:

| Lỗi | Khi nào |
| :--- | :--- |
| `ElectionNotFound` | `id ≥ electionCount` |
| `WrongPhase(current)` | gọi hàm sai pha (kèm pha hiện tại) |
| `InvalidParams` | tham số tạo cuộc bầu cử vi phạm mục 2.1; hoặc `commitment` không hợp lệ |
| `NotApprover` / `AlreadyApproved` | không phải người duyệt / duyệt lần hai |
| `ElectionNotActive` | `commit` khi chưa đủ chữ ký duyệt |
| `InvalidProof` | ví không nằm trong danh sách cử tri |
| `AlreadyCommitted` / `NoCommitment` / `AlreadyRevealed` | nộp lần hai / mở phiếu khi chưa nộp / mở lần hai |
| `InvalidCandidate` | `candidateId` không tồn tại |
| `BadReveal` | `candidateId` hoặc `salt` không khớp cam kết |

---

## 5. Trường hợp ngoại lệ

| # | Tình huống | Hệ thống phải | Kiểm chứng |
| :-: | :--- | :--- | :--- |
| E1 | Cử tri nộp phiếu khi cuộc bầu cử chưa đủ chữ ký duyệt (hoặc hết hạn duyệt mà thiếu chữ ký) | Từ chối `ElectionNotActive`; cuộc bầu cử không bao giờ mở được vì không thể duyệt sau pha `Registration` | Nhóm B, C |
| E2 | Ví ngoài danh sách (hoặc dùng bằng chứng của người khác) cố nộp phiếu | Từ chối `InvalidProof`, không ghi gì | Nhóm E |
| E3 | Cử tri nộp phiếu lần hai, hoặc mở phiếu lần hai | `AlreadyCommitted` / `AlreadyRevealed`; số phiếu không đổi | Nhóm C, D, E |
| E4 | Kẻ gian chép `commitment` của người khác rồi tự mở phiếu | `BadReveal` (băm có `msg.sender`) | Nhóm E |
| E5 | Dùng cam kết của cuộc bầu cử 0 cho cuộc bầu cử 1 | `BadReveal` (băm có `id`) | Nhóm E |
| E6 | Mở phiếu sau khi pha Reveal hết hạn (phiếu trễ) | `WrongPhase(Ended)`, phiếu **không** được tính | Nhóm D |
| E7 | Cử tri nộp nhưng không mở phiếu; số người mở chưa đạt quorum | `result` trả `(false, 0, 0)`; không ai bị mất quyền hay tiền | Nhóm F |
| E8 | Hai hoặc nhiều ứng viên cùng số phiếu cao nhất | `valid = false`; cần bầu lại hoặc hiệp thương ngoài chuỗi | Nhóm F |
| E9 | Đọc kết quả khi chưa kết thúc | `WrongPhase`, tránh lộ tỷ số sớm qua `result` | Nhóm E |
| E10 | Tham số tạo cuộc bầu cử vô lý (1 ứng viên, 0 phút, quorum > 100%, người duyệt trùng/là người tạo, root rỗng…) | `InvalidParams`, không tạo cuộc bầu cử | Nhóm A |
| E11 | Cử tri mất `salt` | Không mở được phiếu → không được tính (giao diện giảm rủi ro bằng file dự phòng `.json`) | Giao diện; xem `ECONOMIC_RULES.md` |

---

## 6. Ngoài phạm vi

- **Không** xác thực danh tính thật (KYC). Hợp đồng chỉ biết "ví nằm trong danh sách Merkle"; việc ví nào thuộc sinh viên nào do ban tổ chức và người duyệt kiểm tra ngoài chuỗi.
- **Không** kiểm chứng `voterCount` trên chuỗi: Merkle root không cho biết số lá. Ban tổ chức khai sai (nhỏ hơn thực tế) có thể hạ ngưỡng quorum. Giảm thiểu bằng cách công bố danh sách cử tri để người duyệt tự dựng lại root và đếm; người duyệt là chốt kiểm soát chính.
- **Không** che số phiếu trong lúc mở phiếu: sự kiện `Revealed` và `getVotes` công khai ngay khi từng người mở. Bí mật chỉ áp dụng trước khi cử tri tự mở phiếu. Cử tri đến sau có thể thấy xu hướng rồi quyết định có mở phiếu hay không (xem `SELF_AUDIT.md` TB3).
- **Không** có vòng bầu lại, ủy quyền phiếu, token, trọng số phiếu, phí, hay hoàn tiền.
- **Không** dùng chứng minh không tri thức (ZK) hay bỏ pha mở phiếu.
- **Không** sửa/hủy cuộc bầu cử sau khi tạo; sai tham số thì tạo cuộc mới.
- **Không** chống sockpuppet ở khâu người duyệt: nếu ban tổ chức tự điều khiển các ví duyệt thì chữ ký duyệt vô nghĩa (TB2).
- Giao diện `web/` là bản minh họa cho đồ án; không thay thế kiểm toán chuyên nghiệp.

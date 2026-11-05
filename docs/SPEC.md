# SPEC — VOTECHAIN (Bầu cử kín Commit–Reveal nhiều tổ chức)

- **Học phần:** ECO2432 — Tiền điện tử & Hợp đồng thông minh
- **Hợp đồng:** [`ProjectCore.sol`](../contracts/project/ProjectCore.sol) (cuộc bầu cử, Commit–Reveal, quorum) · [`OrganizationRegistry.sol`](../contracts/project/OrganizationRegistry.sol) (tổ chức, thành viên, đại diện duyệt) · [`VoterCardSBT.sol`](../contracts/project/VoterCardSBT.sol) (thẻ cử tri không chuyển nhượng). Solidity `^0.8.20`, biên dịch 0.8.20.
- **Phiên bản đặc tả:** v4.0 — khớp với mã nguồn hiện tại (nhiều tổ chức, nhóm duyệt theo tổ chức, hash hồ sơ, thẻ cử tri). Thay thế v3.0 (người tạo tự chọn người duyệt, chưa có tổ chức).
- **Nhóm:** Nguyễn Thị Kim Chi (23K4300025), Võ Thị Thư (23K4300038)

> Mọi tên hàm, lỗi, sự kiện trong tài liệu này được đối chiếu tự động với bản biên dịch (xem `test/web_abi.test.js`). Mỗi quy tắc có test tương ứng ở cột "Kiểm chứng" (`npx hardhat test`, hiện 194 ca).

---

## 1. Mục đích

Cho phép một lớp hoặc câu lạc bộ **bầu ban cán sự bằng phiếu kín trên blockchain**: không ai thấy cử tri bầu cho ai trước khi chính cử tri mở phiếu, mỗi ví trong danh sách chỉ được một phiếu, và kết quả chỉ được công nhận khi đủ tỷ lệ tham gia (quorum) và có đúng một người dẫn đầu.

Nhiều tổ chức dùng chung nền tảng. Mỗi tổ chức có nhóm đại diện duyệt riêng; cuộc bầu cử chỉ hoạt động khi đủ chữ ký của nhóm đó.

Người dùng:
- **Quản trị nền tảng** (`platformAdmin`): xác minh hoặc đình chỉ tổ chức; chỉnh hạn mức chống spam.
- **Manager** của tổ chức: quản lý thành viên và đại diện duyệt.
- **Proposer / Manager** (ban tổ chức): tạo cuộc bầu cử, cập nhật hồ sơ ứng viên khi còn ở pha Đăng ký.
- **Đại diện duyệt**: ký duyệt hoặc từ chối cuộc bầu cử.
- **Cử tri**: nộp và mở phiếu; sau khi mở phiếu có thể nhận thẻ cử tri.
- **Người xem**: đọc kết quả.

---

## 2. Đầu vào

### 2.1 Tạo cuộc bầu cử — `createElection(NewElection p)`

Người gọi phải là **Proposer hoặc Manager của một tổ chức đã `Verified`**. Nhóm duyệt và ngưỡng duyệt được **lấy từ tổ chức**, không do người tạo tự chọn.

| Trường | Kiểu | Ràng buộc (vi phạm → `InvalidParams()`) |
| :--- | :--- | :--- |
| `organizationId` | `uint256` | Tổ chức phải `Verified` (`OrganizationNotVerified`) và người gọi là Proposer/Manager (`NotAuthorized`) |
| `title` | `string` | 1–120 byte |
| `names` | `string[]` | 2–20 ứng viên; mỗi tên 1–64 byte |
| `candidateWallets` | `address[]` | Tùy chọn, tối đa bằng số ứng viên. **Không lưu trên chuỗi**; chỉ dùng để loại các ví này khỏi nhóm duyệt (xung đột lợi ích, quy tắc R10) |
| `regMinutes` | `uint256` | 1 – 43 200 (30 ngày) và không vượt `pendingTtl` (mặc định 7 ngày). Thời gian chờ chữ ký duyệt |
| `commitMinutes` | `uint256` | 1 – 43 200. Thời gian nộp phiếu kín |
| `revealMinutes` | `uint256` | 1 – 43 200. Thời gian mở phiếu |
| `quorumBps` | `uint256` | 0 – 10 000 (1% = 100 bps; 5000 = 50%) |
| `voterCount` | `uint256` | 1 – 1 000 000 (`MAX_VOTERS`). Số cử tri **do ban tổ chức tự khai** (xem mục 6 và `SELF_AUDIT.md` TB1) |
| `merkleRoot` | `bytes32` | Khác 0 (sinh bằng `scripts/merkle.js`) |
| `metadataHash` | `bytes32` | Khác 0. Hash của hồ sơ cuộc bầu cử (quy tắc R11) |
| `candidateMetadataHashes` | `bytes32[]` | Đúng bằng số ứng viên, mỗi phần tử khác 0. Hash hồ sơ từng ứng viên |

### 2.2 Các thao tác khác

| Hàm | Đầu vào | Người gọi |
| :--- | :--- | :--- |
| `approveElection(id)` / `rejectElection(id)` | `id` cuộc bầu cử | Đại diện trong nhóm duyệt đã chụp của cuộc đó, chỉ ở pha Đăng ký |
| `withdrawElection(id)` | `id` | Người tạo, chỉ khi chưa có chữ ký duyệt hoặc phiếu từ chối nào |
| `releaseExpired(id)` | `id` | Bất kỳ ai, khi đã quá hạn duyệt mà thiếu chữ ký (giải phóng hạn mức chống spam) |
| `updateElectionMetadata(id, newHash)` / `updateCandidateMetadata(id, candidateId, newHash)` | hash mới | Người tạo, chỉ ở pha Đăng ký; xóa mọi chữ ký đã có |
| `commit(id, commitment, merkleProof)` | `commitment = keccak256(abi.encodePacked(id, candidateId, salt, msg.sender))` (`salt` là `string`); `merkleProof` = bằng chứng ví nằm trong danh sách | Cử tri |
| `reveal(id, candidateId, salt)` | ID ứng viên và chính chuỗi `salt` đã dùng khi commit | Cử tri |
| `setLimits(perWallet, perOrg, ttl)` | hạn mức chống spam, trong khoảng an toàn | Quản trị nền tảng |
| `mint(electionId, avatarId)` (`VoterCardSBT`) | cuộc bầu cử đã mở phiếu, hình linh vật | Cử tri đã mở phiếu |
| Hàm của `OrganizationRegistry` | `registerOrganization`, `updateOrganization`, `addMember`, `addApprover`, `replaceApprover`… | Chủ tổ chức / Manager / quản trị nền tảng (xem `ARCHITECTURE_V2.md` mục 2) |
| `result(id)`, `phase(id)`, `get*` | `id` | Bất kỳ ai (hàm đọc, không tốn gas) |

**Danh sách cử tri** không nằm trên chuỗi: chỉ có `merkleRoot`. Lá cây = `keccak256(abi.encodePacked(address))`; cặp nút được sắp xếp; nút lẻ ở cuối tầng được đưa nguyên lên tầng trên (`scripts/merkle.js`).

---

## 3. Quy tắc nghiệp vụ

Mỗi quy tắc là một khẳng định kiểm tra được. Cột cuối là nhóm test chứng minh.

| # | Quy tắc | Kiểm chứng |
| :-: | :--- | :--- |
| **R1** | **Pha theo thời gian, không có công tắc thủ công.** `phase(id)` suy ra từ `block.timestamp`: `Registration` (≤ `regEnd`) → `Commit` (≤ `commitEnd`) → `Reveal` (≤ `revealEnd`) → `Ended`. Các mốc là `regEnd = tạo + regMinutes`, `commitEnd = regEnd + commitMinutes`, `revealEnd = commitEnd + revealMinutes` và **không đổi sau khi tạo**. Tại đúng giây `regEnd` vẫn là pha cũ, sau 1 giây là pha mới. | `ProjectCore` nhóm G |
| **R2** | **Cuộc bầu cử chỉ có hiệu lực khi đủ chữ ký duyệt.** Chỉ đại diện thuộc nhóm đã chụp của cuộc đó mới gọi được `approveElection`, mỗi người một lần, **chỉ trong pha `Registration`**. Khi `approvalCount ≥ requiredApprovals` thì `isActivated = true`. Chưa kích hoạt thì `commit` bị từ chối (`ElectionNotActive`). Người tạo không tự duyệt được (R10). | `ProjectCore` nhóm B, E; `Organization` nhóm C |
| **R3** | **Chỉ ví trong danh sách mới nộp được phiếu.** `commit` yêu cầu `merkleProof` hợp lệ cho `keccak256(msg.sender)` so với `merkleRoot`; sai → `InvalidProof`. Mỗi ví nộp **một lần** (`AlreadyCommitted`). `commitment` bằng 0 hoặc bằng giá trị đánh dấu nội bộ bị từ chối (`InvalidParams`). Chỉ nộp được trong pha `Commit`. | `ProjectCore` nhóm C, E, H |
| **R4** | **Mở phiếu phải khớp cam kết.** `reveal` chỉ trong pha `Reveal`; ví phải đã commit (`NoCommitment`), chưa mở (`AlreadyRevealed`), `candidateId` hợp lệ (`InvalidCandidate`), và `keccak256(id, candidateId, salt, msg.sender)` phải bằng cam kết đã nộp (`BadReveal`). Thành công thì cộng đúng 1 phiếu, tăng `revealedCount`, phát `Revealed`. | `ProjectCore` nhóm D, E |
| **R5** | **Chống sao chép và phát lại phiếu.** Băm có `msg.sender` (không dùng được cam kết của người khác) và có `id` (cam kết của cuộc bầu cử này vô dụng ở cuộc khác). | `ProjectCore` nhóm E |
| **R6** | **Quorum bằng basis points.** Kết quả chỉ có thể hợp lệ khi `revealedCount × 10000 ≥ voterCount × quorumBps`. Bằng đúng ngưỡng vẫn đạt. Cam kết mà không mở phiếu **không** được tính vào quorum. | `ProjectCore` nhóm F |
| **R7** | **Kết quả chỉ đọc được sau khi kết thúc và chỉ hợp lệ khi có đúng một người dẫn đầu.** `result(id)` chỉ gọi được ở pha `Ended` (`WrongPhase`). Trả về `valid = true` khi đạt quorum **và** đúng một ứng viên có số phiếu cao nhất > 0. Hòa nhất, không ai có phiếu, hoặc không đủ quorum → `(false, 0, 0)`. | `ProjectCore` nhóm F |
| **R8** | **Nhiều cuộc bầu cử độc lập.** Mỗi `id` có dữ liệu riêng; phiếu và kết quả cuộc này không ảnh hưởng cuộc khác. Quản trị nền tảng **không** đổi được phiếu, kết quả, mốc thời gian hay chữ ký của cuộc nào; quyền của họ chỉ là xác minh/đình chỉ tổ chức và chỉnh hạn mức chống spam. Không có hàm tạm dừng hay xóa cuộc bầu cử. | `ProjectCore` nhóm G; `Organization` nhóm A |
| **R9** | **Tổ chức phải được xác minh và người tạo phải có vai trò.** Chỉ Proposer/Manager của tổ chức `Verified` mới `createElection`. Nhóm duyệt (2–10 đại diện) và ngưỡng `⌈2n/3⌉` được **chụp lại** vào cuộc bầu cử lúc tạo; đổi đại diện sau đó không ảnh hưởng cuộc đang chạy. | `Organization` nhóm A, B, C |
| **R10** | **Chống tự duyệt và xung đột lợi ích.** Người tạo và các ví khai trong `candidateWallets` bị **loại khỏi nhóm duyệt** (phát `ApproverExcluded`). Số đại diện còn lại phải ≥ 2, nếu không `createElection` revert `NotEnoughApprovers`. Phiếu từ chối đủ nhiều để không thể đạt ngưỡng thì yêu cầu bị đóng (`Rejected`). | `Organization` nhóm D, E |
| **R11** | **Hồ sơ có hash, khóa sau pha Đăng ký.** Chuỗi chỉ lưu `keccak256` của hồ sơ (JSON chuẩn hóa) của cuộc bầu cử và từng ứng viên; nội dung nằm ngoài chuỗi. Người tạo chỉ được đổi hash **trong pha `Registration`** (sau đó `MetadataLocked`). Mỗi lần đổi **xóa toàn bộ chữ ký và phiếu từ chối** nên nhóm duyệt phải duyệt lại; mỗi hash có số phiên bản và sự kiện. | `Metadata` nhóm A, B, C, D |
| **R12** | **Chống spam yêu cầu duyệt.** Mỗi ví tối đa 3 và mỗi tổ chức tối đa 10 yêu cầu đang chờ (`PendingLimit`); yêu cầu hết hạn sau `pendingTtl` (mặc định 7 ngày) và ai cũng gọi được `releaseExpired` để giải phóng hạn mức. Người tạo rút yêu cầu được khi chưa có chữ ký nào. Quản trị nền tảng chỉ chỉnh được hạn mức trong khoảng an toàn (`setLimits`). | `AntiSpam` |
| **R13** | **Thẻ cử tri không chuyển nhượng và chỉ cấp cho người đã mở phiếu.** `mint` chỉ cho chính `msg.sender` (không có tham số "người nhận"), chỉ khi `hasRevealed`, mỗi ví một thẻ mỗi cuộc (`tokenId` xác định theo cuộc và ví). Mọi hàm chuyển nhượng/ủy quyền đều revert. Thẻ không lưu lựa chọn của cử tri, và ảnh thẻ không hiện ví hay lựa chọn của ai (ví chủ thẻ vốn công khai qua `ownerOf`, như mọi NFT). | `VoterCardSBT` |

**Sự kiện (mọi thay đổi trạng thái đều phát sự kiện):**
`ElectionCreated`, `ElectionProposed`, `ElectionApproved`, `ElectionActivated`, `ElectionRejectionVote`, `ElectionRejected`, `ElectionWithdrawn`, `RequestExpired`, `ApproverExcluded`, `ApprovalsReset`, `ElectionMetadataSet`, `CandidateMetadataSet`, `LimitsUpdated`, `Committed`, `Revealed`. Tổ chức: `OrganizationRegistered/Verified/Suspended/Updated`, `MemberAdded/Removed/RoleUpdated`, `ApproverAdded/Removed/Replaced`. Thẻ: `Transfer`, `Locked`, `CardMinted`.

---

## 4. Đầu ra

| Đầu ra | Ở đâu | Nội dung |
| :--- | :--- | :--- |
| `createElection` → `id` | giá trị trả về, sự kiện `ElectionCreated` | ID tăng dần từ 0 (`electionCount`) |
| `phase(id)`, `requestStatus(id)` | hàm đọc, giao diện `web/` | Pha `Registration / Commit / Reveal / Ended`; trạng thái yêu cầu `Pending / Approved / Rejected / Withdrawn / Expired` |
| `getElectionBasicInfo`, `getElectionStats`, `getElectionOrg` | hàm đọc, giao diện | admin, tên, đã kích hoạt, `merkleRoot`; các mốc thời gian, quorum, số cử tri, số đã mở phiếu, số chữ ký; tổ chức và hash hồ sơ |
| `getCandidates`, `getVotes`, `getCandidateMetadata` | hàm đọc, giao diện | tên ứng viên; số phiếu (chỉ tăng ở pha Reveal); hash và phiên bản hồ sơ ứng viên |
| `getVoterStatus(id, voter)` | hàm đọc | `(committed, revealed)` |
| `result(id)` | hàm đọc, nút "Xem kết quả" | `(valid, winnerId, topVotes)` |
| `cardOf`, `tokenURI` (`VoterCardSBT`) | hàm đọc, giao diện | cuộc bầu cử, số thứ tự thẻ, ngày cấp, linh vật; siêu dữ liệu ERC-721 |
| Lỗi tùy biến | giao dịch bị revert; giao diện dịch sang tiếng Việt | xem bảng dưới |
| Sự kiện | nhật ký giao dịch trên Etherscan | xem mục 3 |

Bảng lỗi chính của `ProjectCore`:

| Lỗi | Khi nào |
| :--- | :--- |
| `ElectionNotFound` | `id ≥ electionCount` |
| `WrongPhase(current)` | gọi hàm sai pha (kèm pha hiện tại) |
| `InvalidParams` | tham số vi phạm mục 2.1; hoặc `commitment` không hợp lệ |
| `OrganizationNotVerified` / `NotAuthorized` | tổ chức chưa xác minh / người gọi không đủ vai trò hoặc không phải người tạo |
| `NotEnoughApprovers` | sau khi loại người tạo và ứng viên, còn dưới 2 đại diện duyệt |
| `NotApprover` / `AlreadyApproved` / `AlreadyRejected` | không thuộc nhóm duyệt / duyệt lần hai / đã từ chối rồi |
| `RequestClosed` / `RequestLocked` / `NotExpired` | yêu cầu đã đóng / đã có chữ ký nên không rút được / chưa quá hạn |
| `PendingLimit` | vượt hạn mức yêu cầu đang chờ (R12) |
| `MetadataLocked` | sửa hash hồ sơ khi đã qua pha Đăng ký |
| `ElectionNotActive` | `commit` khi chưa đủ chữ ký duyệt |
| `InvalidProof` | ví không nằm trong danh sách cử tri |
| `AlreadyCommitted` / `NoCommitment` / `AlreadyRevealed` | nộp lần hai / mở phiếu khi chưa nộp / mở lần hai |
| `InvalidCandidate` | `candidateId` không tồn tại |
| `BadReveal` | `candidateId` hoặc `salt` không khớp cam kết |
| `NotPlatformAdmin` | gọi `setLimits` mà không phải quản trị nền tảng |

---

## 5. Trường hợp ngoại lệ

| # | Tình huống | Hệ thống phải | Kiểm chứng |
| :-: | :--- | :--- | :--- |
| E1 | Cử tri nộp phiếu khi cuộc bầu cử chưa đủ chữ ký duyệt (hoặc hết hạn duyệt mà thiếu chữ ký) | Từ chối `ElectionNotActive`; cuộc bầu cử không bao giờ mở được vì không thể duyệt sau pha `Registration` | `ProjectCore` nhóm B, C |
| E2 | Ví ngoài danh sách (hoặc dùng bằng chứng của người khác) cố nộp phiếu | Từ chối `InvalidProof`, không ghi gì | nhóm E |
| E3 | Cử tri nộp phiếu lần hai, hoặc mở phiếu lần hai | `AlreadyCommitted` / `AlreadyRevealed`; số phiếu không đổi | nhóm C, D, E |
| E4 | Kẻ gian chép `commitment` của người khác rồi tự mở phiếu | `BadReveal` (băm có `msg.sender`) | nhóm E |
| E5 | Dùng cam kết của cuộc bầu cử 0 cho cuộc bầu cử 1 | `BadReveal` (băm có `id`) | nhóm E |
| E6 | Mở phiếu sau khi pha Reveal hết hạn (phiếu trễ) | `WrongPhase(Ended)`, phiếu **không** được tính | nhóm D |
| E7 | Cử tri nộp nhưng không mở phiếu; số người mở chưa đạt quorum | `result` trả `(false, 0, 0)`; không ai bị mất quyền hay tiền | nhóm F |
| E8 | Hai hoặc nhiều ứng viên cùng số phiếu cao nhất | `valid = false`; cần bầu lại hoặc hiệp thương ngoài chuỗi | nhóm F |
| E9 | Đọc kết quả khi chưa kết thúc | `WrongPhase`, tránh lộ tỷ số sớm qua `result` | nhóm E |
| E10 | Tham số tạo cuộc bầu cử vô lý (1 ứng viên, 0 phút, quorum > 100%, hash rỗng, root rỗng…) | `InvalidParams`, không tạo cuộc bầu cử | nhóm A |
| E11 | Cử tri mất `salt` | Không mở được phiếu → không được tính (giao diện giảm rủi ro bằng file dự phòng `.json`) | Giao diện; xem `ECONOMIC_RULES.md` |
| E12 | Ví thường (không phải người tạo) cố sửa hash hồ sơ ứng viên | `NotAuthorized`, hash không đổi | `Metadata` nhóm C |
| E13 | Người tạo sửa hồ sơ sau khi qua pha Đăng ký | `MetadataLocked` | `Metadata` nhóm C |
| E14 | Người tạo tự đưa mình hoặc ứng viên vào nhóm duyệt | Bị loại khỏi nhóm duyệt; nếu còn dưới 2 đại diện thì `NotEnoughApprovers` | `Organization` nhóm D |
| E15 | Một ví tạo hàng loạt yêu cầu để làm tắc hàng chờ | `PendingLimit` sau 3 yêu cầu đang chờ; hạn mức tự giải phóng khi quá hạn | `AntiSpam` |
| E16 | Tổ chức chưa xác minh hoặc đã bị đình chỉ tạo cuộc bầu cử mới | `OrganizationNotVerified` | `Organization` nhóm A |
| E17 | Cử tri chưa mở phiếu cố nhận thẻ; hoặc nhận thẻ lần hai; hoặc chuyển thẻ | `NotRevealed` / `AlreadyMinted` / mọi hàm chuyển nhượng revert | `VoterCardSBT` |
| E18 | Nội dung hồ sơ trên Supabase bị sửa lén | Trình duyệt băm lại, thấy khác hash trên chuỗi và hiện "KHÔNG khớp hash" | `web_metadata.test.js` (băm giống nhau ở web và script); kiểm thử giao diện `scripts/e2e/` |

---

## 6. Ngoài phạm vi

- **Không** xác thực danh tính thật (KYC). Hợp đồng chỉ biết "ví nằm trong danh sách Merkle"; việc ví nào thuộc sinh viên nào do ban tổ chức và nhóm duyệt kiểm tra ngoài chuỗi.
- **Không** đưa khâu đề cử ứng viên lên chuỗi. Việc ai ra ứng cử và gửi thông tin cho ban tổ chức là quy trình ngoài chuỗi; chuỗi bảo vệ tính toàn vẹn từ khi danh sách được chốt (R10, R11). `candidateWallets` là tự khai và không lưu lại (xem `SELF_AUDIT.md`).
- **Không** kiểm chứng `voterCount` trên chuỗi: Merkle root không cho biết số lá. Ban tổ chức khai sai (nhỏ hơn thực tế) có thể hạ ngưỡng quorum. Giảm thiểu bằng cách công bố danh sách cử tri để nhóm duyệt tự dựng lại root và đếm; nhóm duyệt là chốt kiểm soát chính.
- **Không** che số phiếu trong lúc mở phiếu: sự kiện `Revealed` và `getVotes` công khai ngay khi từng người mở. Bí mật chỉ áp dụng trước khi cử tri tự mở phiếu. Cử tri đến sau có thể thấy xu hướng rồi quyết định có mở phiếu hay không (xem `SELF_AUDIT.md` TB3).
- **Không** có vòng bầu lại, ủy quyền phiếu, token có giá trị, trọng số phiếu, phí, hay hoàn tiền. Thẻ cử tri chỉ là bằng chứng tham gia, không có giá trị tiền tệ.
- **Không** dùng chứng minh không tri thức (ZK) hay bỏ pha mở phiếu.
- **Không** xóa hay hủy cuộc bầu cử sau khi đã kích hoạt; sai thì tạo cuộc mới. Cuộc chưa có chữ ký thì người tạo rút được (`withdrawElection`).
- **Không** chống sockpuppet ở khâu đại diện duyệt: nếu ban tổ chức tự điều khiển các ví đại diện thì chữ ký duyệt vô nghĩa (TB2).
- Nội dung hồ sơ (mô tả, tiểu sử, ảnh) lưu ở Supabase, ngoài chuỗi. Chỉ hash nằm trên chuỗi; Supabase không thể làm giả nội dung mà không bị phát hiện, nhưng có thể **ẩn** hoặc **không phục vụ** nội dung (khi đó giao diện báo "chưa có nội dung để đối chiếu").
- Giao diện `web/` là bản minh họa cho đồ án; không thay thế kiểm toán chuyên nghiệp.

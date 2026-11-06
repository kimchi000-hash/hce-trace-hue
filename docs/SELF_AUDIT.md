# TỰ RÀ SOÁT — VoteChain v2 (theo danh mục 10 hạng mục của Lab 14)

- **Đối tượng:** [`ProjectCore.sol`](../contracts/project/ProjectCore.sol) (585 dòng), [`OrganizationRegistry.sol`](../contracts/project/OrganizationRegistry.sol) (278 dòng), [`VoterCardSBT.sol`](../contracts/project/VoterCardSBT.sol) (314 dòng); Solidity 0.8.20. Phần ngoài chuỗi (Supabase) xem mục 4.
- **Cách làm:** đọc từng hàm theo bảng 10 hạng mục của sổ tay; mỗi kết luận trích số dòng và test. Công cụ AI (Claude) hỗ trợ đọc mã và chạy test; kết luận do nhóm xem lại (xem `AI_JOURNAL.md`).
- **Phân biệt:** đây là **tự** rà soát. Báo cáo do nhóm khác viết về hợp đồng của nhóm được xử lý ở mục 5; báo cáo hiện có trong [`AUDIT_REPORT.md`](AUDIT_REPORT.md) là bản rà soát hợp đồng của nhóm VotaChain (không phải về hợp đồng này).
- **Phạm vi lần cập nhật này:** bản rà soát ban đầu (313 dòng, một cuộc bầu cử) được viết lại cho bản v2. Số dòng bên dưới là của mã **hiện tại**.

## Tóm tắt

Phát hiện **1 lỗi thật đã sửa** (TB4), **9 điểm yếu thiết kế hoặc giới hạn** ghi nhận (TB1–TB3, TB5–TB10): các điểm này là chấp nhận có điều kiện hoặc có biện pháp giảm thiểu, không điểm nào cho phép đổi phiếu, đổi kết quả hay lấy tiền. Không hợp đồng nào giữ ETH. Lời gọi giữa các hợp đồng chỉ là hàm **đọc** (`view`): `ProjectCore` gọi 5 hàm của registry, `VoterCardSBT` gọi 3 hàm của `ProjectCore` (`electionCount`, `hasRevealed`, `getElectionBasicInfo`). Điểm yếu đáng nói nhất là những chỗ phụ thuộc vào con người: `voterCount` tự khai (TB1), đại diện duyệt có thật độc lập hay không (TB2), Manager đổi tên tổ chức sau khi đã xác minh (TB6).

## 1. Danh mục 10 hạng mục

| # | Hạng mục | Kết luận | Bằng chứng (dòng) |
| :-: | :--- | :---: | :--- |
| 1 | **Phân quyền** | Đạt | Mọi hàm ghi đều kiểm tra người gọi. `ProjectCore`: `createElection` yêu cầu tổ chức `Verified` và `canPropose` (173–174); `approveElection`/`rejectElection` yêu cầu thuộc nhóm duyệt đã chụp (275, 295); `withdrawElection` và hai hàm sửa hash yêu cầu đúng người tạo (313, `_editable` 511–515); `setLimits` yêu cầu quản trị nền tảng (354); `commit` yêu cầu bằng chứng Merkle gắn `msg.sender` (372–374); `reveal` đọc/ghi theo `msg.sender` (387, 394). `OrganizationRegistry`: `onlyPlatformAdmin` (85–88), `onlyManager` gồm điều kiện tổ chức `Verified` (91–96). `VoterCardSBT.mint` không có tham số "người nhận" (87–93). Test: `Organization` nhóm A–E, `Metadata` nhóm C, `VoterCardSBT` |
| 2 | **Thứ tự thao tác** | Đạt | Không có chuyển ETH hay gọi hợp đồng ngoài mà có thể quay lại gọi `ProjectCore`. Trong `reveal`: kiểm tra (388–391) → ghi `REVEALED`, tăng phiếu (394–396) → phát sự kiện (397). `commit`: kiểm tra → ghi (378) → sự kiện (379). `VoterCardSBT.mint` gọi `hasRevealed` (hàm `view`) rồi mới ghi thẻ (90–104). Không có `call`, `transfer` hay `delegatecall` |
| 3 | **Điều kiện thời gian** | Đạt | `phase()` dùng `<=` (401–405): đúng giây `regEnd/commitEnd/revealEnd` vẫn thuộc pha cũ. Mốc cố định, không có công tắc thủ công. Hạn duyệt `regMinutes ≤ pendingTtl` (175). `releaseExpired` dùng `block.timestamp <= regEnd` nên đúng giây hạn chưa coi là quá hạn (324). Test biên: `ProjectCore` nhóm G. `block.timestamp` có thể lệch vài giây do thợ đào; chấp nhận với pha tính bằng phút |
| 4 | **Phép chia** | Đạt, **1 lỗi tràn số đã sửa** | Không có phép chia; quorum so sánh bằng nhân (`revealedCount × 10000 ≥ voterCount × quorumBps`, dòng 416). `voterCount` do người tạo tự đặt nên có thể tràn → **TB4**. Ngưỡng duyệt `(2n+2)/3` ở registry (211) là phép chia số nguyên có chủ đích, kiểm tra với n = 2…10 ở test `Organization` nhóm C |
| 5 | **Cách chuyển ETH** | Không áp dụng | Ba hợp đồng không có `payable`, `receive` hay `fallback`; ETH gửi thẳng vào bị từ chối. Không có `transfer`/`call{value}` |
| 6 | **Dữ liệu riêng tư** | Đạt có điều kiện | `commitments` công khai nhưng là mã băm. Phiếu **được lộ có chủ đích** khi cử tri mở: sự kiện `Revealed(id, voter, candidateId)` (397) liên kết ví với ứng viên mãi mãi → **TB3, TB5**. Băm `id‖candidateId‖salt‖msg.sender` không bị nhập nhằng đóng gói: `salt` là chuỗi duy nhất có độ dài thay đổi và đứng trước trường 20 byte cuối. Merkle: lá là băm 20 byte, nút trong là băm 64 byte nên không lẫn lá với nút. Thẻ cử tri chỉ lưu cuộc bầu cử, số thứ tự, ngày cấp, linh vật, chủ thẻ; **không lưu lựa chọn** |
| 7 | **Vòng lặp** | Đạt | Mọi vòng lặp bị chặn: ứng viên ≤ 20 (`MAX_CANDIDATES`), đại diện ≤ 10 (`MAX_APPROVERS`), `candidateWallets` ≤ số ứng viên (232) nên vòng loại xung đột tối đa 10 × 20 (243–245). `_sweep` và `_livePending` chạy trên danh sách chờ có trần bởi hạn mức (`maxPendingPerWallet ≤ 50`, `maxPendingPerOrg ≤ 200`, 353–356). Vòng Merkle chạy theo độ dài bằng chứng do chính người gọi gửi và trả gas. `unchecked { ++i; }` chỉ ở biến đếm có `i < n` |
| 8 | **Sự kiện** | Đạt | Mọi hàm đổi trạng thái đều phát sự kiện: `ElectionCreated`/`ElectionProposed`, `ElectionApproved`, `ElectionActivated`, `ElectionRejectionVote`, `ElectionRejected`, `ElectionWithdrawn`, `RequestExpired`, `ApproverExcluded`, `ApprovalsReset`, `ElectionMetadataSet`, `CandidateMetadataSet`, `LimitsUpdated`, `Committed`, `Revealed`; registry có sự kiện cho từng thay đổi tổ chức, thành viên, đại diện; thẻ có `Transfer`, `Locked`, `CardMinted` |
| 9 | **Trường hợp số 0** | Đạt | `names < 2`, `voterCount == 0`, `merkleRoot == 0`, `metadataHash == 0`, hash ứng viên `== 0`, `regMinutes/commitMinutes/revealMinutes == 0`, `commitment == 0` đều bị `InvalidParams` (205–233, 375). Không ai mở phiếu + `quorumBps = 0` → vẫn `valid = false` vì `topVotes = 0`. Registry: `addMember` với `address(0)` hoặc vai trò `None` bị chặn (151); `organizationId = 0` không bao giờ `Verified` (216) |
| 10 | **Địa chỉ rỗng** | Đạt | Constructor của ba hợp đồng từ chối địa chỉ 0 (`ProjectCore` 164, `VoterCardSBT` 65). `candidateWallets` chứa `address(0)` chỉ làm vòng loại không khớp ai. `scripts/merkle.js` từ chối `0x0` khi dựng cây. `transferPlatformAdmin(address(0))` bị từ chối (105) |

## 2. Phát hiện và xử lý

### TB4 — `voterCount` quá lớn làm `result()` revert vĩnh viễn · **Trung bình · ĐÃ SỬA**
- **Vị trí:** `_validate` (dòng 223) và `result` (dòng 416).
- **Mô tả:** `voterCount` do người tạo tự đặt, ban đầu chỉ bị chặn `== 0`. Giá trị như `2²⁵⁶−1` làm phép `voterCount × quorumBps` trong `result()` tràn số; Solidity 0.8 revert với `Panic(0x11)`.
- **Hậu quả:** sau khi cuộc bầu cử kết thúc, không ai gọi được `result()` (số phiếu vẫn đọc được bằng `getVotes`). Không mất tiền, nhưng kết quả chính thức không đọc được và hợp đồng không sửa được.
- **Cách sửa:** thêm `MAX_VOTERS = 1 000 000` (dòng 89) và từ chối `voterCount` lớn hơn bằng `InvalidParams` (223). Test mới: `ProjectCore` nhóm A (hai ca `voterCount` vượt trần và `2²⁵⁶−1`; một ca biên `voterCount = MAX_VOTERS` với quorum 100% vẫn đọc được `result()`).
- **Ai phát hiện:** công cụ AI khi đi hạng mục 4; nhóm đã xác nhận bằng test.

### TB1 — `voterCount` không kiểm chứng được trên chuỗi · **Trung bình · CHẤP NHẬN CÓ ĐIỀU KIỆN**
- Merkle root không cho biết số lá. Ban tổ chức khai nhỏ hơn thực tế sẽ hạ ngưỡng quorum (ví dụ danh sách 100 người nhưng khai 10: chỉ cần 5 người mở phiếu là đủ 50%).
- **Giảm thiểu:** đại diện duyệt phải tự dựng lại root từ danh sách công bố, đếm lá, đối chiếu `voterCount` trước khi ký (ghi trong SPEC mục 6, ECONOMIC U4). Sửa triệt để cần chứng minh số lá hoặc đưa danh sách lên chuỗi (tốn gas, đổi thiết kế), ngoài phạm vi.

### TB2 — Đại diện duyệt có thể là ví giả do ban tổ chức điều khiển · **Trung bình · CHẤP NHẬN CÓ BIỆN PHÁP**
- Từ v2, người tạo **không tự chọn** đại diện: nhóm duyệt do Manager của tổ chức quản lý và được chụp lại khi tạo cuộc (237–257). Người tạo và các ví khai trong `candidateWallets` bị loại (242–248), còn lại phải ≥ 2 (256).
- **Giới hạn còn lại:** hợp đồng không chứng minh được hai ví khác nhau thuộc hai người khác nhau. Nếu Manager đồng thời điều khiển mọi đại diện thì chữ ký vô nghĩa.
- **Giảm thiểu:** công bố địa chỉ đại diện (`getApprovers`) cùng danh tính; chọn giảng viên hoặc cố vấn làm đại diện; quản trị nền tảng chỉ xác minh những tổ chức có đại diện độc lập.

### TB3 — Thấy tỷ số trong pha Reveal rồi mới quyết định mở phiếu · **Thấp · CHẤP NHẬN**
- `getVotes` và sự kiện `Revealed` công khai theo thời gian thực, nên cử tri đến sau có thể bỏ phiếu chiến lược (không mở phiếu nếu phe mình đã thua/thắng). Hợp đồng chỉ đảm bảo bí mật **đến lúc từng người tự mở phiếu**.
- **Giảm thiểu:** pha Reveal ngắn; nêu rõ trong SPEC mục 6.

### TB5 — Phiếu không ẩn danh sau khi mở · **Thấp · CHẤP NHẬN (thuộc yêu cầu của đề tài)**
- Liên kết ví–ứng viên công khai vĩnh viễn sau `reveal`. Đây là hệ quả của commit–reveal đơn giản, không phải lỗi; nếu cần ẩn danh thật thì phải dùng ZK (ngoài phạm vi). Thẻ cử tri vì vậy chỉ chứng minh đã **mở phiếu**, không thêm thông tin nào.

### TB6 — Manager đổi tên tổ chức sau khi đã được xác minh · **Trung bình · CHẤP NHẬN CÓ BIỆN PHÁP**
- **Vị trí:** `OrganizationRegistry.updateOrganization` (141–147). Hàm yêu cầu `onlyManager` (kèm trạng thái `Verified`) nhưng cho đổi `name` và `infoHash` mà **không cần xác minh lại**.
- **Tình huống:** tổ chức "CLB A" được quản trị nền tảng xác minh, sau đó Manager đổi tên thành tên giống một tổ chức uy tín khác để tạo cuộc bầu cử đánh lừa cử tri.
- **Giảm thiểu:** mọi lần đổi phát `OrganizationUpdated(id, name, infoHash)` nên truy vết được; quản trị nền tảng đình chỉ được (`suspendOrganization`, 119) và khi đó tổ chức không tạo được cuộc mới; danh sách chọn tổ chức ở giao diện hiển thị mã `#id` cạnh tên. Sửa triệt để (cần xác minh lại khi đổi tên) làm thay đổi quy trình nên chưa làm.

### TB7 — Sửa hash hồ sơ có thể bị `PendingLimit` · **Thấp · GHI NHẬN**
- **Vị trí:** `_resetApprovals` (519–535) gọi `_enqueue` khi cuộc bầu cử đã kích hoạt (532), mà `_enqueue` revert `PendingLimit` nếu người tạo đã có đủ yêu cầu đang chờ khác (563).
- **Hậu quả:** người tạo có 3 yêu cầu chờ khác thì không sửa được hash hồ sơ của một cuộc đã kích hoạt trong pha Đăng ký, dù hợp lệ. Không ảnh hưởng an toàn hay phiếu; cách khắc phục là rút hoặc chờ các yêu cầu kia hết hạn.
- **Ghi chú trung thực:** suy ra từ đọc mã; chưa có test riêng cho tổ hợp này.

### TB8 — Hai ứng viên có thể trùng tên · **Thấp · GHI NHẬN**
- `_validate` (205–233) chỉ kiểm tra độ dài tên, không kiểm tra trùng. Cử tri phân biệt bằng số thứ tự và hồ sơ; hợp đồng vẫn đếm đúng theo `candidateId`. Rủi ro là gây nhầm lẫn khi hiển thị, không ảnh hưởng kết quả. Giao diện hiển thị số thứ tự cạnh tên.

### TB9 — Điểm phụ thuộc vào một khóa · **Thấp · CHẤP NHẬN**
- `platformAdmin` là một ví; mất khóa thì không xác minh được tổ chức mới (có `transferPlatformAdmin` để chuyển trước khi mất, 104–108). Chủ tổ chức không chuyển quyền sở hữu được (`CannotChangeOwner`); mất khóa chủ thì tổ chức chỉ còn các Manager khác nếu đã được đặt trước. Các cuộc bầu cử đã tạo vẫn chạy bình thường vì mọi tham số bất biến.

### TB10 — Phụ thuộc Supabase cho nội dung hồ sơ · **Thấp · CHẤP NHẬN**
- Hash nằm trên chuỗi nên Supabase **không thể làm giả** nội dung mà không bị phát hiện, nhưng có thể **ngừng phục vụ** hoặc xóa nội dung. Khi đó giao diện báo "chưa có nội dung để đối chiếu"; tên ứng viên, số phiếu và kết quả vẫn đọc từ chuỗi. Xem mục 4.

### TB11 — Phạm vi xem: kết quả chỉ ẩn trên giao diện, ảnh đã công khai không thu hồi được · **Thấp · CHẤP NHẬN CÓ GHI RÕ**
- Ba phạm vi xem (thông tin, hồ sơ ứng viên, kết quả) nằm trong metadata có hash; RLS ép việc đọc nội dung ngoài chuỗi và ảnh riêng tư chỉ xem qua URL ký 10 phút. **Kết quả không ẩn được trên chuỗi:** `getVotes` không có điều kiện pha và sự kiện `Revealed` công khai, nên chọn kết quả hạn chế chỉ ẩn trang kết quả trong giao diện. Tên cuộc, tên ứng viên, mốc thời gian, ví ứng viên (calldata) cũng công khai.
- Đổi từ công khai sang hạn chế không thu hồi được nội dung đã công khai (bản cũ của hồ sơ và ảnh cũ ở kho công khai vẫn còn); hash hồ sơ không phải mã hóa nên hồ sơ không công khai có thêm `salt` ngẫu nhiên.
- Chưa chạy trên Supabase thật (migration `20261106000002_visibility.sql`, triển khai lại `chain-sync`); test RLS chạy trên PGlite, test giao diện dùng Supabase giả lập.

## 3. Cái không phải lỗi nhưng cần hiểu (câu hỏi vấn đáp thường gặp)

- **Vì sao băm có `msg.sender` và `id`?** Chặn chép cam kết của người khác và phát lại giữa các cuộc bầu cử (test nhóm E).
- **Vì sao `salt` là `string`?** Cho phép salt dễ lưu/ghi lại; giao diện sinh 32 byte ngẫu nhiên dạng chuỗi hex. Kiểu `string` không giới hạn độ dài, người dùng tự chịu gas calldata.
- **Vì sao không có mapping `isVoter`?** Danh sách đưa lên chuỗi tốn gas theo số cử tri; Merkle root cố định 32 byte, cử tri tự nộp bằng chứng khi bỏ phiếu.
- **Vì sao `REVEALED` ghi đè `commitments`?** Tiết kiệm ≈ 19,5 nghìn gas mỗi lần mở phiếu (xem `GAS_REPORT.md`); đổi lại phải chặn `commitment == REVEALED` ở `commit` (dòng 375).
- **Vì sao nhóm duyệt được "chụp lại"?** Để đổi đại diện của tổ chức sau này không làm đổi luật của cuộc đã tạo, và để người tạo không đổi người duyệt giữa chừng (R9).
- **Vì sao sửa hash hồ sơ phải xóa chữ ký?** Đại diện đã ký trên nội dung cũ; sửa nội dung rồi giữ chữ ký là cách lách duyệt (R11, `_resetApprovals`).
- **Vì sao `candidateWallets` không được lưu?** Chỉ cần lúc tạo để loại xung đột; lưu thêm tốn gas mà không phục vụ quy tắc nào. Đổi lại đây là dữ liệu **tự khai** (TB2).
- **Vì sao thẻ cử tri không có tham số người nhận?** Để không ai mint thẻ hộ hoặc mạo danh người khác; tokenId xác định theo (cuộc bầu cử, ví) nên không mint hai lần.
- **Hợp đồng vượt 150 dòng của bộ lọc phạm vi** (`ProjectCore` 585 dòng, ba hợp đồng 1 177 dòng). Nhóm biết rõ và xin điều chỉnh phạm vi (xem `GATE_REVIEW_1.md`, phụ lục); chưa có xác nhận của giảng viên.

## 4. Phần ngoài chuỗi (Supabase, Edge Function)

Phạm vi và giới hạn của phần này:

- **Đã kiểm thử cục bộ:** lược đồ, chính sách RLS, hàm SQL `SECURITY DEFINER` với `search_path` rỗng, quyền thực thi (anon bị thu hồi), cột `profile` không nằm trong quyền `UPDATE` trực tiếp, hàm `save_organization_profile` chỉ cho Manager ghi hồ sơ (`npm run test:supabase`, 82 ca, chạy trên PGlite), cùng logic Edge Function (đăng nhập bằng ví, nonce dùng một lần, băm TypeScript trùng băm JavaScript) trong `npx hardhat test`.
- **Quyết định thiết kế:** khóa `service_role` và `SYNC_SECRET` chỉ nằm ở môi trường Edge Function, không có trong mã giao diện hay Git. Giao diện chỉ dùng khóa công khai (`publishable`).
- **Chưa kiểm chứng:** chưa chạy trên dự án Supabase thật với ví MetaMask thật; các bài e2e giao diện dùng Supabase giả lập. Đây là bước kiểm thử còn lại trước khi nộp.

## 5. Báo cáo rà soát chéo nhận được từ nhóm khác (Lab 14)

> **Chưa có.** Theo sổ tay, nhóm được ghép vòng tròn sẽ viết báo cáo về `ProjectCore.sol` của nhóm này. Khi nhận, lưu thành `docs/AUDIT_REPORT.md` (thay bản hiện có) hoặc giữ cả hai tên, rồi điền bảng bên dưới và commit `lab-14: xu ly ket qua audit cheo`.

| # | Phát hiện của nhóm bạn | Mức độ | Phản hồi của nhóm (sửa / chấp nhận + lý do) | Commit sửa |
| :-: | :--- | :-: | :--- | :--- |
| | *(điền sau khi nhận báo cáo)* | | | |

## 6. Cách tái lập mọi khẳng định ở trên

```bash
npm install
npx hardhat test       # 201 ca: hợp đồng, Merkle, tổ chức, chống spam, hash hồ sơ, thẻ cử tri, khớp ABI, Edge Function
npm run test:supabase  # 82 ca: lược đồ, RLS, hàm SQL, quyền
```

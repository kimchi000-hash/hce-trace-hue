# Bản đồ hàm — luyện vấn đáp cá nhân (Buổi 21)

> Mục đích: khi giảng viên chọn ngẫu nhiên một hàm, trả lời được 4 ý: **hàm làm gì · ai được gọi · vì sao thiết kế như vậy · nếu sai thì chuyện gì xảy ra**. Số dòng lấy từ mã nguồn hiện tại (nhánh `phase4-supabase`); nếu sửa hợp đồng thì phải cập nhật lại bảng này.

Ba hợp đồng: `OrganizationRegistry.sol` (278 dòng) · `ProjectCore.sol` (585 dòng) · `VoterCardSBT.sol` (314 dòng).

---

## 1. OrganizationRegistry — tổ chức, thành viên, đại diện duyệt

| Hàm (dòng) | Ai gọi | Làm gì | Vì sao thiết kế vậy |
|---|---|---|---|
| `registerOrganization` (127–139) | Bất kỳ ví | Tạo tổ chức, trạng thái `Pending`; ví gọi thành `Manager` kiêm `owner` | Đăng ký mở để ai cũng nộp hồ sơ, nhưng chưa có quyền gì cho đến khi được xác minh |
| `verifyOrganization` (111–116) | Chỉ `platformAdmin` | `Pending`/`Suspended` → `Verified` | Điểm tin cậy duy nhất của tầng nền tảng; admin **không** thêm/xóa thành viên, không chọn đại diện, không đụng kết quả |
| `suspendOrganization` (119–124) | Chỉ `platformAdmin` | → `Suspended`: không tạo cuộc bầu mới | Cuộc bầu đang chạy **vẫn tiếp tục** vì đại diện đã được chụp (snapshot) lúc tạo |
| `updateOrganization` (141–147) | `Manager` (tổ chức phải `Verified`) | Đổi tên + `infoHash` | Tên đổi được không cần xác minh lại; nội dung hồ sơ nằm ở Supabase, chuỗi chỉ giữ hash |
| `addMember` (150–156) | `Manager` | Thêm thành viên với vai trò Member/Proposer/Manager | Tối đa `MAX_MEMBERS` = 1000 để vòng lặp không vượt gas |
| `removeMember` (158–170) | `Manager` | Xóa thành viên (hoán vị phần tử cuối rồi `pop`) | Không xóa được `owner`, không xóa được người đang là đại diện duyệt |
| `updateMemberRole` (172–178) | `Manager` | Đổi vai trò | Không đổi được vai trò của `owner` |
| `addApprover` (182–189) | `Manager` | Thêm đại diện duyệt (phải là thành viên) | Tối đa `MAX_APPROVERS` = 10 |
| `removeApprover` (192–197) | `Manager` | Gỡ đại diện | Không cho xuống dưới `MIN_APPROVERS` = 2 |
| `replaceApprover` (199–207) | `Manager` | Thay một đại diện bằng người khác | Cách đổi người mà không rơi xuống dưới 2 |
| `approvalThreshold` (211–213) | View | `⌈2n/3⌉ = (2n+2)/3` | Ví dụ: 3 đại diện → 2; 5 → 4; 10 → 7 |
| `canPropose` (220–224) | View (ProjectCore gọi) | `true` nếu tổ chức `Verified` và ví là Proposer/Manager | ProjectCore kiểm tra quyền ở **trên chuỗi**, không chỉ ở giao diện |
| `onlyManager` (91–96) | Modifier | Phải là Manager của đúng tổ chức **và** tổ chức `Verified` | Tổ chức bị đình chỉ thì không quản lý được nữa |

Câu hỏi hay gặp: *"Admin nền tảng có sửa được kết quả không?"* — Không. Admin chỉ có 2 quyền: xác minh và đình chỉ (cộng `transferPlatformAdmin`, và `setLimits` ở ProjectCore để chỉnh hạn mức chống spam). Không có hàm nào cho admin ghi phiếu hay đổi danh sách cử tri.

---

## 2. ProjectCore — vòng đời cuộc bầu cử

Các pha: `Registration` (chờ duyệt) → `Commit` → `Reveal` → `Ended`. Pha tính theo `block.timestamp` so với `regEnd`, `commitEnd`, `revealEnd` (hàm `phase`, 401–406).

### 2.1 Tạo và phê duyệt

| Hàm (dòng) | Ai gọi | Làm gì | Vì sao |
|---|---|---|---|
| `createElection` (171–203) | Proposer/Manager của tổ chức `Verified` | Kiểm tra tham số (`_validate` 205–233), chụp đại diện (`_snapshotApprovers` 237–257), ghi hash metadata (`_recordMetadata` 260), đưa vào hàng chờ (`_enqueue` 558) | Mọi điều kiện ép ở trên chuỗi: quyền (dòng 173–174), tổ chức Verified, số ứng viên ≤ 20, số cử tri 1 … `MAX_VOTERS` = 1.000.000 (dòng 89; chặn tràn số khi nhân với quorum), mỗi pha ≤ 30 ngày, 3 mốc thời gian hợp lệ |
| `_snapshotApprovers` (237–257) | Nội bộ | Sao chép danh sách đại diện của tổ chức; **loại** ví nằm trong `candidateWallets` (vòng lặp 242–248, phát `ApproverExcluded`); còn dưới 2 người thì `NotEnoughApprovers` (256) | Chống xung đột lợi ích: ứng viên không được tự duyệt cuộc bầu của mình. `candidateWallets` là tham số tùy chọn, **không lưu**, chỉ dùng để loại |
| `approveElection` (274–291) | Đại diện đã chụp | Ký duyệt; đủ ngưỡng `⌈2n/3⌉` thì kích hoạt (`ElectionActivated`) | Mỗi đại diện duyệt một lần; một khi kích hoạt thì không sửa được metadata nữa |
| `rejectElection` (294–308) | Đại diện đã chụp | Bỏ phiếu từ chối; khi số từ chối > (số đại diện − ngưỡng duyệt), tức không thể đủ ngưỡng nữa, thì đóng yêu cầu (`closedReason = 2`) | Không phải chờ hết hạn mới dọn được đề xuất xấu |
| `withdrawElection` (311–319) | Người đề xuất | Rút lại yêu cầu khi còn chờ duyệt | Giải phóng hạn mức chống spam |
| `releaseExpired` (322–327) | Bất kỳ ai | Dọn yêu cầu quá hạn (7 ngày mặc định) | Ai cũng dọn được nên hạn mức không bị kẹt |

### 2.2 Metadata (nội dung ngoài chuỗi)

| Hàm (dòng) | Làm gì | Ghi chú |
|---|---|---|
| `updateElectionMetadata` (332–339) | Đổi `metadataHash` của cuộc bầu | Chỉ trong pha `Registration` (qua `_editable` 511–515), ngoài ra `MetadataLocked` |
| `updateCandidateMetadata` (341–349) | Đổi hash của một ứng viên | Như trên |
| `_resetApprovals` (519–534) | Xóa chữ ký đã có khi metadata đổi | Đại diện phải duyệt lại nội dung mới — không "duyệt bản A rồi đổi thành bản B" |
| `getCandidateMetadata` (495) | Trả `(hash, version)` | Giao diện băm lại nội dung Supabase trong trình duyệt và so với hash này; khớp mới hiện "Đã xác thực hash" |

### 2.3 Bỏ phiếu commit–reveal

| Hàm (dòng) | Ai gọi | Làm gì | Kiểm tra theo thứ tự |
|---|---|---|---|
| `commit` (366–380) | Cử tri trong danh sách | Gửi `keccak256(id, candidateId, salt, voter)` | đúng pha Commit → đã kích hoạt → Merkle proof (372–374) → commitment khác 0 và khác `REVEALED` (375) → chưa commit (376) → ghi (378) |
| `reveal` (382–398) | Cử tri đã commit | Mở phiếu: gửi `candidateId` + `salt` | có commit → chưa reveal → ứng viên hợp lệ → băm khớp (388–391) → ghi `REVEALED` **trước** khi cộng phiếu (394) → phát sự kiện (397) |
| `result` (409–428) | Bất kỳ ai, sau pha Ended | Trả `(valid, winnerId, topVotes)` | `valid` = đủ quorum (dòng 416: `revealedCount × 10000 ≥ voterCount × quorumBps`) **và** có đúng một người dẫn đầu (hòa → không hợp lệ) |

Vì sao commit–reveal: nếu gửi thẳng lựa chọn thì ai cũng thấy kết quả đang chạy và bị ảnh hưởng. Commit giấu lựa chọn bằng salt; reveal mới công khai, sau khi đã hết thời gian commit.

Vì sao Merkle: danh sách cử tri không ghi lên chuỗi; chỉ lưu 1 gốc 32 byte, mỗi người nộp proof khi commit. Nhờ vậy gas tạo cuộc bầu gần như không đổi theo số cử tri.

Vì sao ghi `REVEALED` trước khi cộng phiếu: theo mẫu checks–effects–interactions; hàm không gọi hợp đồng ngoài nên không có tấn công tái nhập, nhưng thứ tự này vẫn chặn reveal lần hai.

### 2.4 Chống spam và quản trị

| Hàm (dòng) | Làm gì |
|---|---|
| `_enqueue` (558–566) | Tối đa 3 yêu cầu chờ / ví, 10 / tổ chức; vượt thì `PendingLimit` (563) |
| `_sweep` (550–556), `_livePending` (540) | Bỏ các yêu cầu đã hết hạn khỏi hàng chờ trước khi đếm |
| `setLimits` (353–361) | Chỉ `platformAdmin`; chỉnh hạn mức trong trần 50/200 và TTL trong khoảng cho phép |

---

## 3. VoterCardSBT — thẻ cử tri không chuyển nhượng

| Hàm (dòng) | Làm gì | Vì sao |
|---|---|---|
| `mint(electionId, avatarId)` (87–108) | Người gọi tự nhận thẻ sau khi đã reveal | Không có tham số `to` nên không ai mint hộ được; kiểm tra `hasRevealed` bên ProjectCore; mỗi (cuộc bầu, ví) một thẻ |
| `tokenIdOf` (78–80) | `(electionId << 160) \| voter` | Token ID suy ra được từ cuộc bầu và ví, nên chống mint trùng không cần mapping phụ |
| `approve`, `setApprovalForAll`, `transferFrom`, `safeTransferFrom` (149–167) | Luôn `revert Soulbound` | Thẻ gắn với ví đã bỏ phiếu, không mua bán được |
| `locked` (135) | `true` | Chuẩn ERC-5192 báo thẻ bị khóa |
| `tokenURI` (177–202) | Sinh metadata và ảnh; có ảnh dự phòng SVG viết trong hợp đồng (`_fallbackSvg` 204) | Vẫn hiển thị khi IPFS không tải được |

Thẻ **không** ghi bạn bầu cho ai. Chỉ ghi: cuộc bầu, số thứ tự, thời điểm, mascot. Giữ được bí mật lựa chọn.

---

## 4. Luồng đầy đủ để kể trong 5 phút

1. Admin xác minh tổ chức → Manager thêm thành viên và 2–10 đại diện.
2. Proposer tạo cuộc bầu (danh sách cử tri thành Merkle root; ứng viên; 3 mốc thời gian; quorum; tùy chọn `candidateWallets`).
3. Đại diện (đã chụp, đã loại ứng viên) duyệt đủ `⌈2n/3⌉` → kích hoạt.
4. Cử tri `commit` với Merkle proof → hết hạn commit → `reveal`.
5. `result` công bố; cử tri đã reveal mint thẻ SBT.

## 5. Giới hạn nên nói thẳng khi được hỏi

- Một người có nhiều ví thì có thể có nhiều quyền bỏ phiếu (Sybil). Danh sách cử tri là do tổ chức cung cấp, hợp đồng không xác minh danh tính.
- Nội dung Supabase (mô tả, ảnh ứng viên) nằm ngoài chuỗi; chuỗi chỉ giữ hash, nên phát hiện được sửa trộm nhưng không ngăn được việc Supabase xóa dữ liệu.
- Salt phải lưu ở trình duyệt; mất salt thì không reveal được, phiếu không được tính.
- Chưa kiểm toán độc lập; `ProjectCore.sol` dài 585 dòng, vượt mức 150 dòng trong bộ lọc phạm vi — chờ giảng viên xác nhận.
- Ứng viên không có ví riêng trong hợp đồng; việc ứng viên đồng ý tham gia dựa vào việc họ đã ứng cử. Ký xác nhận của ứng viên chỉ là hướng phát triển.

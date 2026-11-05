# VoteChain v2: kiến trúc tổ chức, chống spam và metadata hash

Tài liệu thiết kế cho nâng cấp "nền tảng bầu cử nội bộ nhiều tổ chức". **Trạng thái hiện tại:** ba hợp đồng (`OrganizationRegistry`, `ProjectCore`, `VoterCardSBT`) đã **triển khai trên Sepolia** (địa chỉ ở `deployments/sepolia.json` và README); Supabase (migration, RLS, Storage, hàm SQL, Edge Function `wallet-auth` và `chain-sync`) đã viết và kiểm thử cục bộ (80 ca); giao diện `web/index.html` đã có tổ chức, tạo/duyệt cuộc bầu cử, đăng nhập ví, xác thực hash, biểu đồ, thẻ cử tri; bộ test hợp đồng hiện 194 ca. **Chưa làm:** kiểm thử với Supabase thật và MetaMask thật trong một lượt đầy đủ, và đưa trang lên địa chỉ web công khai. Hướng dẫn: `docs/SEPOLIA_DEPLOY_V2.md`, `docs/SUPABASE_SETUP.md`.

## 1. Hai hợp đồng, một ranh giới rõ

| Hợp đồng | Trách nhiệm | Không làm |
| :--- | :--- | :--- |
| `OrganizationRegistry` | Tổ chức, trạng thái xác minh, thành viên + vai trò, đại diện duyệt, ngưỡng 2/3 | Không biết gì về bầu cử, phiếu, kết quả |
| `ProjectCore` | Cuộc bầu cử, Merkle, Commit–Reveal, quorum, kết quả, hàng chờ duyệt, hạn mức, metadata hash | Không lưu danh sách thành viên, không tự chọn người duyệt |

`ProjectCore` chỉ gọi 5 hàm `view` của registry (`isVerified`, `canPropose`, `getApprovers`, `approvalThreshold`, `platformAdmin`) qua địa chỉ `immutable`, không gọi hàm ghi, không chuyển ETH, nên không có bề mặt reentrancy.

Kích thước (optimizer tắt, Solidity 0.8.20): `ProjectCore` 21.529 byte, `OrganizationRegistry` 15.862 byte, đều dưới giới hạn 24.576 byte.

## 2. Phân quyền (kiểm tra trên chuỗi)

| Vai trò | Quyền |
| :--- | :--- |
| Quản trị viên nền tảng (`platformAdmin`) | Xác minh, đình chỉ, khôi phục tổ chức; chỉnh hạn mức chống spam trong khoảng an toàn. **Không** thêm/xóa thành viên, **không** chọn đại diện, **không** duyệt, **không** sửa metadata |
| Manager (chủ tổ chức khi đăng ký, hoặc được nâng quyền) | Thêm/xóa thành viên, đổi vai trò, thêm/xóa/thay đại diện, sửa tên tổ chức. Chỉ khi tổ chức `Verified` |
| Proposer | Đề xuất cuộc bầu cử cho tổ chức |
| Member | Thành viên; có thể được đặt làm đại diện duyệt |
| Đại diện duyệt | Duyệt hoặc từ chối cuộc bầu cử trong snapshot của cuộc đó |

Chủ sở hữu không bị gỡ hay hạ quyền. Thành viên đang là đại diện phải gỡ quyền đại diện trước khi bị xóa.

## 3. Đại diện duyệt và ngưỡng

- Mỗi tổ chức có danh sách riêng, 2 đến 10 người, quản lý bởi Manager, mọi thay đổi có event.
- Ngưỡng = `ceil(2n/3)`: n=2→2, 3→2, 4→3, 5→4, 6→4, 7→5, 8→6, 9→6, 10→7.
- **Snapshot khi tạo**: danh sách và ngưỡng được chụp vào cuộc bầu cử. Đổi đại diện sau đó không ảnh hưởng cuộc đang chạy.
- **Tự duyệt và xung đột lợi ích**: người tạo và các ví ứng viên khai báo (`candidateWallets`) bị **loại khỏi snapshot**; ngưỡng tính trên số còn lại, và số còn lại phải ≥ 2, nếu không `createElection` revert `NotEnoughApprovers`.
- Từ chối: đại diện bỏ phiếu từ chối; khi số phiếu từ chối làm không thể đạt ngưỡng thì yêu cầu bị đóng (`Rejected`).

**Giới hạn đã biết:** `candidateWallets` do người tạo tự khai (hợp đồng chỉ lưu tên ứng viên dạng chuỗi nên không tự biết ví của ứng viên). Người tạo không khai thì không có xung đột nào bị loại. Đây là giới hạn của tự khai, giảm nhẹ bằng việc đại diện là thành viên của tổ chức và bị ghi event; có thể nâng cấp bằng cách yêu cầu ứng viên ký xác nhận ví.

## 4. Chống spam

Cấu hình (chỉ `platformAdmin` đổi được, có chặn khoảng): `maxPendingPerWallet = 3`, `maxPendingPerOrg = 10`, `pendingTtl = 7 ngày`.

- Một yêu cầu "đang chờ duyệt" khi: chưa kích hoạt, chưa bị rút/từ chối, và chưa qua `regEnd`. Hạn chờ duyệt = `regEnd`, và `regMinutes × 60 ≤ pendingTtl` được kiểm tra khi tạo.
- Hạn mức được giải phóng khi: kích hoạt, từ chối, rút, hoặc hết hạn.
- **Không có bộ đếm trôi**: mỗi ví và mỗi tổ chức giữ một mảng id đang chờ, kích thước bị chặn bởi chính hạn mức. Trước mỗi lần tạo, hợp đồng dọn các id đã hết hạn/đã đóng khỏi hai mảng rồi mới kiểm tra, nên yêu cầu hết hạn không bao giờ chiếm chỗ. `releaseExpired(id)` cho phép ai cũng dọn thủ công; các view `pendingCountOf*` chỉ đếm yêu cầu còn hiệu lực.
- Rút yêu cầu: chỉ người tạo, và chỉ khi chưa có chữ ký duyệt/từ chối nào (chưa bị khóa bởi quy trình duyệt).
- Không giới hạn tổng số cuộc bầu cử trong vòng đời của ví hay tổ chức. Không đặt cọc.

**Giới hạn đã biết:** hạn mức theo ví không chặn được Sybil (một người có nhiều ví). Lớp chặn thứ hai là hạn mức theo tổ chức, và lớp thứ ba là yêu cầu người tạo phải là Proposer/Manager do chính tổ chức thêm (xác minh thành viên), nên spam từ bên ngoài tổ chức không thực hiện được.

## 5. Metadata hash

Trên chuỗi chỉ lưu `bytes32` và số phiên bản, cùng event cho mọi lần đặt hash:
`ElectionMetadataSet(id, version, hash)` và `CandidateMetadataSet(id, candidateId, version, hash)`.
Lịch sử hash cũ không bị xóa vì nằm trong log sự kiện.

**Chuẩn hóa JSON** (`scripts/metadata.js`, bản nhúng trong giao diện phải giống hệt):
1. Khóa object sắp tăng dần theo thứ tự đơn vị UTF-16, không khoảng trắng.
2. Chuỗi chuẩn hóa Unicode NFC (cả khóa lẫn giá trị).
3. Chỉ nhận số nguyên an toàn; số thực, NaN, `undefined` bị từ chối.
4. `hash = keccak256(UTF-8 bytes của chuỗi chuẩn hóa)`.
5. Ảnh và tài liệu không băm URL: manifest chứa `{role, name, mime, size, checksum}` với `checksum = keccak256(nội dung file)`, và manifest nằm trong metadata nên bị băm theo.
6. Hồ sơ ứng viên có trường `index`, nên hoán đổi hồ sơ giữa hai ứng viên bị phát hiện.

**Quy tắc cập nhật** (hợp đồng áp dụng, chỉ người tạo gọi được):
| Thời điểm | Kết quả |
| :--- | :--- |
| Chờ duyệt, chưa có chữ ký | Ghi hash mới, tăng phiên bản |
| Chờ duyệt, đã có chữ ký | Ghi hash mới, **xóa chữ ký**, duyệt lại từ đầu |
| Đã kích hoạt nhưng chưa tới Commit | Ghi hash mới, **hủy kích hoạt**, quay lại hàng chờ (chiếm hạn mức, đầy thì `PendingLimit`), duyệt lại |
| Từ Commit trở đi | `MetadataLocked`: khóa |
| Yêu cầu đã bị rút/từ chối | `RequestClosed` |

**Lưu ý thời gian:** duyệt lại vẫn phải xong trước `regEnd`; nếu không kịp, cuộc bầu cử không kích hoạt (như quy tắc cũ). Người tạo nên chốt metadata sớm.

Giao diện tải metadata từ Supabase, tính lại hash theo đúng quy tắc trên rồi so với hash trên chuỗi; khớp thì hiện nhãn "Đã xác thực hash" và nội dung (ảnh, tiểu sử, mô tả); lệch thì hiện cảnh báo "KHÔNG khớp hash", không âm thầm hiển thị. Ví cử tri không có chỗ sửa hồ sơ: chỉ người tạo cuộc bầu cử mới cập nhật được, và chỉ trong pha Đăng ký (hợp đồng chặn sau đó bằng `MetadataLocked`).

## 6. On-chain và off-chain

| Dữ liệu | Nơi lưu | Nguồn tin cậy |
| :--- | :--- | :--- |
| Tổ chức, vai trò, đại diện, trạng thái xác minh | Registry | Hợp đồng |
| Cuộc bầu cử, snapshot duyệt, Merkle root, phiếu, kết quả | ProjectCore | Hợp đồng |
| Hash metadata + phiên bản | ProjectCore | Hợp đồng |
| Mô tả, ảnh, tiểu sử, tài liệu; hồ sơ tổ chức (mô tả, đơn vị chủ quản, năm thành lập, liên hệ) | Supabase | Chỉ tin khi hash khớp chuỗi (`infoHash` của tổ chức, hash hồ sơ của cuộc và ứng viên) |
| Chỉ mục truy vấn, lịch sử hiển thị | Supabase | Không dùng làm nguồn kết quả |

Kết quả bầu cử, phê duyệt và quyền hạn luôn đọc từ hợp đồng. RLS của Supabase không thay thế quyền trên hợp đồng.

## 7. Gas (500 cử tri, 5 ứng viên, tổ chức 3 đại diện)

| Thao tác | Gas |
| :--- | ---: |
| Deploy OrganizationRegistry | 3.488.529 |
| Deploy ProjectCore | 4.754.314 |
| registerOrganization | 229.129 |
| verifyOrganization | 33.080 |
| addMember | 104.490 |
| addApprover | 83.370 |
| createElection | 1.011.904 |
| approveElection (chưa đủ / kích hoạt) | 84.019 / 100.023 |
| commit | ≈ 68.630 |
| reveal (đầu / sau) | 89.862 / 55.662 |

`commit` và `reveal` gần như không đổi so với bản trước (68.652 và 89.927); `createElection` tăng do hash metadata, snapshot đại diện và hàng chờ.

## 8. Bản đồ test (20 tình huống bắt buộc)

| # | Tình huống | Test |
| :--- | :--- | :--- |
| 1 | Đăng ký tổ chức | `Organization.test.js` A [1] |
| 2 | Chưa xác minh không tạo được | A [2] |
| 3 | Tổ chức xác minh quản lý thành viên | B [3] |
| 4 | Người ngoài không tạo được | B [4], `ProjectCore.test.js` E |
| 5 | Số đại diện khác nhau, ngưỡng 2/3 | C [5] |
| 6 | Không thêm đại diện trùng | C [6] |
| 7 | Không tự duyệt, xung đột lợi ích | D [7] |
| 8 | Chỉ qua khi đủ phiếu duyệt | C [8] |
| 9 | Vượt hạn mức | `AntiSpam.test.js` [9] |
| 10 | Giải phóng hạn mức (hủy, từ chối, hết hạn) | AntiSpam [10] |
| 11 | Hash tạo và ghi đúng | `Metadata.test.js` B [11] |
| 12 | Sửa metadata bị phát hiện | B [11/12], A |
| 13 | Lịch sử phiên bản | C [13] |
| 14 | Khóa khi Commit | C [14] |
| 15–20 | Merkle, Commit–Reveal, salt, quorum, kết quả | `ProjectCore.test.js` C–H, Metadata D [15-20] |

Kiểm thử thêm: kiểm soát quyền (platformAdmin không can thiệp được nội bộ), biên tham số, sai pha, reentrancy (không có chuyển ETH hay lời gọi ghi ra ngoài).

## 9. Thẻ cử tri (Soulbound NFT)

`VoterCardSBT` tách khỏi `ProjectCore` (không sửa lõi bỏ phiếu). Điều kiện nhận thẻ do hợp đồng kiểm tra qua `ProjectCore.hasRevealed(id, voter)`; `tokenId = (electionId << 160) | voter` nên mỗi ví chỉ một thẻ cho mỗi cuộc bầu cử; mọi thao tác chuyển nhượng/ủy quyền đều revert (ERC-5192). Thẻ chỉ lưu `electionId`, serial, ngày cấp, mascot; **không lưu lựa chọn hay salt**. Ảnh mascot lấy từ thư mục IPFS bất biến (cấu hình lúc deploy), hoặc emoji dựng trên chuỗi nếu không cấu hình. Nhận thẻ là tùy chọn, không ảnh hưởng tính hợp lệ của phiếu. Supabase không cần thay đổi. Xem `docs/SEPOLIA_DEPLOY_V2.md` mục 9.

## 10. Hồ sơ tổ chức

- **Đăng ký:** `registerOrganization(name, infoHash)`, trong đó `infoHash = keccak256` của hồ sơ chuẩn hóa (`votechain.organization.v1`: tên, loại, mô tả, đơn vị chủ quản, email, website, năm thành lập). Một số loại tổ chức (ví dụ Lớp) không có đơn vị chủ quản hay website; trường bỏ trống luôn rỗng trong hồ sơ.
- **Lưu nội dung:** gọi hàm SQL `save_organization_profile(p_org, p_profile)` (`SECURITY DEFINER`, `search_path` rỗng, chỉ người đã đăng nhập bằng ví). Người gọi phải là Manager; tổ chức đang chờ xác minh chỉ lưu được một lần, tổ chức đã xác minh được ghi đè. Cột `profile` không nằm trong quyền `UPDATE` trực tiếp.
- **Chờ đồng bộ:** tổ chức mới chỉ có trong Supabase sau khi `chain-sync` đọc chuỗi; trong lúc chờ, bản nháp nằm trong `localStorage` của trình duyệt người đăng ký và tự lưu khi tổ chức đã đồng bộ.
- **Chỉnh sửa:** Manager của tổ chức đã xác minh gọi `updateOrganization(id, name, infoHash mới)` rồi lưu nội dung mới lên Supabase. Nếu bước Supabase lỗi, bản nháp được giữ và tự thử lại; bản nháp lệch hash trên chuỗi bị bỏ.
- **Đối chiếu:** thẻ "Hồ sơ tổ chức" băm lại nội dung và so với `infoHash`: "Khớp hash" hoặc "KHÔNG khớp".
- **Giới hạn:** logo không nằm trong hồ sơ băm vì Storage chỉ cho Manager của tổ chức đã xác minh tải lên; Manager có thể đổi tên tổ chức sau khi được xác minh (xem `SELF_AUDIT.md` TB6).

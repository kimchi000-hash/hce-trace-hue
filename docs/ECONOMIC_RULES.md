# QUY TẮC KINH TẾ — VOTECHAIN (v4.0)

- **Hợp đồng:** [`ProjectCore.sol`](../contracts/project/ProjectCore.sol), [`OrganizationRegistry.sol`](../contracts/project/OrganizationRegistry.sol), [`VoterCardSBT.sol`](../contracts/project/VoterCardSBT.sol) · **Đặc tả:** [`SPEC.md`](SPEC.md) (R1–R13)
- **Nhóm:** Nguyễn Thị Kim Chi (23K4300025), Võ Thị Thư (23K4300038)

Hệ thống này **không giữ tiền và không phát token**. "Giá trị" ở đây là **quyền biểu quyết** (một ví một phiếu, giữ kín đến lúc mở) và **chi phí gas** mà mỗi bên phải trả. Tài liệu theo bốn mục của sổ tay (dòng tiền/quyền lợi, giới hạn chống lạm dụng, quyền quản trị, tình huống người dùng bị thiệt), thêm chi phí đo thật và phản biện.

---

## 1. Dòng tiền và quyền lợi

### 1.1 Ai nhận quyền gì

| Bên | Quyền | Nguồn quyền |
| :--- | :--- | :--- |
| Quản trị nền tảng | Xác minh hoặc đình chỉ tổ chức; chỉnh hạn mức chống spam trong khoảng an toàn. **Không** duyệt, không sửa hồ sơ, không đụng phiếu hay kết quả | Địa chỉ `platformAdmin` của `OrganizationRegistry` |
| Chủ tổ chức / Manager | Thêm, xóa thành viên; đặt Proposer; chọn 2–10 đại diện duyệt; sửa tên và hash hồ sơ tổ chức. Chỉ khi tổ chức đã `Verified` | Người đăng ký tổ chức là chủ và Manager |
| Ban tổ chức (Proposer/Manager gọi `createElection`) | Đặt tên, ứng viên, mốc thời gian, quorum, danh sách cử tri (qua Merkle root), hash hồ sơ. Còn **sửa được hash hồ sơ trong pha Đăng ký**; sau đó mọi tham số bất biến | Vai trò trong tổ chức đã `Verified` |
| Đại diện duyệt (2–10 ví của tổ chức, đã chụp lại cho từng cuộc) | Ký duyệt hoặc từ chối trong pha `Registration`; đủ `⌈2n/3⌉` chữ ký thì cuộc bầu cử mới hoạt động | Do Manager chỉ định; **người tạo và ví ứng viên khai báo bị loại** khỏi nhóm của cuộc đó |
| Cử tri | Một phiếu kín, một lần mở phiếu; sau khi mở có thể nhận một thẻ cử tri | Ví nằm trong danh sách Merkle |
| Người xem | Đọc mọi dữ liệu, gồm `result` sau khi kết thúc | Công khai |

Không có quyền chuyển nhượng, bán, ủy quyền phiếu, hay rút tiền. Thẻ cử tri là huy hiệu không chuyển nhượng, không có giá trị tiền tệ, nên không có thị trường mua bán phiếu hay thẻ.

### 1.2 Ai trả phí gì (đo thật, xem mục 5)

| Bên | Giao dịch | Gas đo được |
| :--- | :--- | ---: |
| Chủ tổ chức | `registerOrganization` | 229 129 |
| Manager | `addMember` / `addApprover` (mỗi người) | 104 490 / 83 370 |
| Ban tổ chức | `createElection` (một lần mỗi cuộc, 5 ứng viên) | 1 011 904 |
| Mỗi đại diện duyệt | `approveElection` | 84 019 (chưa đủ ngưỡng) / 100 023 (chữ ký kích hoạt) |
| Mỗi cử tri | `commit` | ≈ 68 630 |
| Mỗi cử tri | `reveal` | 89 862 (phiếu đầu của một ứng viên) / 55 662 (các phiếu sau) |
| Cử tri (tùy chọn) | `mint` thẻ cử tri | 128 245 |
| Nhóm (một lần) | Triển khai `OrganizationRegistry` + `ProjectCore` + `VoterCardSBT` | 3 488 529 + 4 754 314 + 3 736 059 |

Cử tri tự trả gas hai lần bắt buộc (commit + reveal), thêm một lần nếu muốn nhận thẻ. Không có phí giao thức, không có người nhận phí. Trên Sepolia, gas là ETH thử nghiệm miễn phí từ faucet; chi phí quy đổi xem mục 5.2.

---

## 2. Giới hạn chống lạm dụng

| Giới hạn | Giá trị | Chặn điều gì | Test |
| :--- | :--- | :--- | :--- |
| Một phiếu mỗi ví | `AlreadyCommitted`, `AlreadyRevealed` | Bỏ phiếu nhiều lần | Nhóm C, D, E |
| Chỉ ví trong Merkle root | `InvalidProof` | Ví lạ vào bầu | Nhóm E, H |
| Băm gắn `msg.sender` | `BadReveal` | Chép cam kết của người khác để "bầu theo" | Nhóm E |
| Băm gắn `id` cuộc bầu cử | `BadReveal` | Dùng lại cam kết giữa các cuộc | Nhóm E |
| Không đổi ý sau khi nộp | `BadReveal` nếu đổi ứng viên | Đổi phiếu theo xu hướng | Nhóm D |
| Mốc thời gian cố định | `WrongPhase` | Nộp trễ, mở sớm/trễ; phiếu trễ không tính | Nhóm D, G |
| Duyệt chỉ trong `Registration` | `WrongPhase` | Duyệt muộn để "cứu" cuộc bầu cử | Nhóm B |
| Tổ chức phải `Verified`, người tạo phải là Proposer/Manager | `OrganizationNotVerified`, `NotAuthorized` | Ví lạ hoặc tổ chức chưa được xác minh tạo cuộc bầu cử | Organization nhóm A, B |
| Nhóm duyệt do tổ chức quản lý và được chụp lại khi tạo | (không có hàm tự chọn người duyệt) | Người tạo tự chọn người quen để duyệt; đổi người duyệt giữa chừng | Organization nhóm C |
| Loại người tạo và ví ứng viên khỏi nhóm duyệt; còn ≥ 2 đại diện | `ApproverExcluded`, `NotEnoughApprovers` | Tự duyệt, ứng viên duyệt chính cuộc bầu cử của mình | Organization nhóm D |
| Tối đa 3 yêu cầu chờ mỗi ví, 10 mỗi tổ chức, tự hết hạn sau 7 ngày | `PendingLimit`, `NotExpired` | Spam yêu cầu duyệt làm tắc hàng chờ của đại diện | AntiSpam |
| Sửa hash hồ sơ chỉ ở pha Đăng ký và xóa chữ ký đã có | `MetadataLocked`, `ApprovalsReset` | Đổi nội dung ứng viên sau khi người duyệt đã ký, hoặc sau khi cử tri đã bầu | Metadata nhóm C |
| Hash hồ sơ khác nội dung lưu ở Supabase | giao diện hiện "KHÔNG khớp hash" | Sửa lén nội dung hồ sơ ngoài chuỗi | web_metadata, e2e |
| Thẻ cử tri chỉ cho ví đã mở phiếu, một thẻ mỗi cuộc, không chuyển nhượng | `NotRevealed`, `AlreadyMinted`; mọi hàm chuyển nhượng revert | Mua bán thẻ, làm thẻ giả cho người chưa bầu | VoterCardSBT |
| `MAX_CANDIDATES = 20`, `MAX_APPROVERS = 10`, tên ≤ 64 byte, tiêu đề ≤ 120 byte | `InvalidParams` | Spam dữ liệu; vòng lặp `result` vượt trần gas | Nhóm A |
| `MAX_VOTERS = 1 000 000` cho `voterCount` | `InvalidParams` | `voterCount` cực lớn làm phép nhân quorum tràn số, khiến `result()` revert vĩnh viễn (phát hiện khi tự rà soát, TB4) | Nhóm A |
| `MAX_PHASE_MINUTES = 43 200` (30 ngày) mỗi pha | `InvalidParams` | Mốc thời gian vô lý; tràn số khi nhân 60 | Nhóm A |
| Quorum ≤ 10 000 bps | `InvalidParams` | Quorum không thể đạt | Nhóm A |
| `result` chỉ ở pha `Ended` | `WrongPhase` | Dùng kết quả sớm | Nhóm E |

**Hạn chế đã biết (không chặn được trong mã, ghi nhận trung thực):** khai sai `voterCount`, người duyệt là ví giả do ban tổ chức điều khiển, và việc cử tri thấy tỷ số trong pha `Reveal` rồi quyết định không mở phiếu. Chi tiết và biện pháp giảm thiểu ở mục 4 và `SELF_AUDIT.md`.

---

## 3. Quyền quản trị

- **Quản trị nền tảng (`platformAdmin`) có quyền hạn hẹp.** Chỉ xác minh, đình chỉ và khôi phục tổ chức, và chỉnh hạn mức chống spam trong khoảng an toàn (`setLimits`). **Không** có quyền duyệt cuộc bầu cử, thêm hoặc xóa thành viên, chọn đại diện, sửa hồ sơ, đọc phiếu chưa mở, hay đổi kết quả. Đình chỉ một tổ chức chặn việc tạo cuộc mới nhưng **không** làm thay đổi cuộc bầu cử đã tạo.
- Không có `onlyOwner` toàn cục trên `ProjectCore`, không có hàm tạm dừng, nâng cấp hay rút tiền. Hợp đồng không giữ ETH nên không có gì để rút.
- **Manager** của tổ chức quản lý thành viên và đại diện duyệt; chủ sở hữu không bị gỡ hay hạ quyền. Thành viên đang là đại diện phải gỡ quyền đại diện trước khi bị xóa.
- **Ban tổ chức** đặt tham số lúc `createElection`. Sau đó mọi tham số bất biến (thời hạn, quorum, root, nhóm duyệt, ngưỡng); chỉ còn **hash hồ sơ**, sửa được trong pha Đăng ký và mỗi lần sửa làm nhóm duyệt phải ký lại.
- **Đại diện duyệt** chỉ có quyền ký hoặc từ chối trong pha `Registration`. Không thể hủy, sửa, hay chặn cử tri đã có bằng chứng hợp lệ.
- **Không ai** (kể cả nhóm phát triển) đọc được phiếu chưa mở, xóa phiếu, hay đổi kết quả. Số phiếu chỉ tăng qua `reveal` hợp lệ.
- **Quyền ngoài chuỗi:** dữ liệu hồ sơ nằm ở Supabase và chỉ Manager/ban tổ chức tương ứng ghi được (chính sách RLS). Nếu Supabase bị ép sửa, hash trên chuỗi khiến việc sửa bị phát hiện; Supabase có thể làm hồ sơ biến mất nhưng không giả được nội dung.
- **Ràng buộc tin cậy còn lại:** ban tổ chức quyết định **ai là cử tri** (qua root) và **`voterCount`** (tự khai). Nhóm đại diện độc lập là biện pháp kiểm soát. Muốn tin cậy hơn, nên chọn đại diện không thuộc ban tổ chức.

---

## 4. Tình huống người dùng bị thiệt

| # | Tình huống | Thiệt hại | Hệ thống xử lý / ai chịu rủi ro |
| :-: | :--- | :--- | :--- |
| U1 | Cử tri **mất salt** (xóa trình duyệt, đổi máy) | Không mở được phiếu → phiếu không được tính, vẫn mất phí commit | Giao diện lưu salt vào localStorage **và** tự tải file `.json` dự phòng, có nút "Nạp file dự phòng". Hợp đồng không thể khôi phục. **Chấp nhận rủi ro**: cử tri chịu |
| U2 | Cử tri **quên mở phiếu** | Phiếu không tính; nếu nhiều người quên → không đủ quorum, cả cuộc bầu cử vô hiệu | Giao diện hiện đếm ngược pha Reveal. Cuộc bầu cử vô hiệu không ai mất tiền; tổ chức lại |
| U3 | **Ví hợp lệ bị loại khỏi danh sách** (ban tổ chức bỏ sót) | Mất quyền bầu | Không sửa được trên chuỗi. Người duyệt phải đối chiếu danh sách công bố trước khi ký; thiếu người thì tạo cuộc bầu cử mới |
| U4 | Ban tổ chức khai **`voterCount` nhỏ** để hạ ngưỡng quorum | Thiểu số có thể quyết định | Không kiểm chứng được trên chuỗi. Người duyệt phải kiểm tra `voterCount` = số lá của root; công bố danh sách. **Rủi ro tin cậy người duyệt** |
| U5 | Ban tổ chức điều khiển cả các ví đại diện duyệt | Chữ ký duyệt vô nghĩa | Hợp đồng loại người tạo và ví ứng viên khai báo khỏi nhóm của cuộc đó (R10), nhưng không biết ví nào thật sự thuộc ai. Người dùng nên kiểm tra danh tính đại diện (`getApprovers`) và tổ chức nên chọn đại diện độc lập |
| U6 | Cử tri **thấy xu hướng** trong pha Reveal rồi cố ý không mở phiếu | Bầu chiến lược; có thể làm hụt quorum | Không chặn được trong mã. Giảm thiểu: pha Reveal ngắn, ghi trong SPEC rằng bí mật chỉ bảo vệ đến lúc từng người tự mở |
| U7 | Hòa phiếu / không đủ quorum | Không có người thắng | `valid = false`; tổ chức bầu lại ngoài chuỗi |
| U8 | Cử tri nộp phiếu rồi bị lộ `salt`/máy bị chiếm trước khi mở | Người khác có thể mở phiếu thay (cần ví của cử tri để ký, nên chỉ có chủ ví) | Hợp đồng ràng `msg.sender`: không ai mở thay được nếu không có khóa ví |
| U9 | Giao dịch commit đã gửi nhưng giao diện/ mạng lỗi | Cử tri tưởng chưa nộp | Giao diện lưu salt **trước** khi gửi giao dịch và đọc lại `getVoterStatus` khi tải trang |
| U10 | Ban tổ chức **không khai `candidateWallets`** nên ứng viên vẫn nằm trong nhóm duyệt | Ứng viên duyệt chính cuộc bầu cử của mình | `candidateWallets` là tự khai và tùy chọn. Giao diện có ô khai ví ứng viên khi tạo cuộc bầu cử; nhóm duyệt kiểm tra danh sách trước khi ký. Có thể nâng cấp bằng cách yêu cầu ứng viên ký xác nhận ví (hướng phát triển) |
| U11 | Ban tổ chức sửa hồ sơ ứng viên **sau khi người duyệt đã ký** | Người duyệt ký trên nội dung cũ | Hợp đồng xóa mọi chữ ký khi hash đổi (`ApprovalsReset`), nên phải duyệt lại; hết pha Đăng ký thì không sửa được nữa (`MetadataLocked`) |
| U12 | Nội dung hồ sơ trên Supabase bị sửa hoặc biến mất | Cử tri xem thông tin sai hoặc không xem được | Trình duyệt băm lại và so với hash trên chuỗi: sai thì báo "KHÔNG khớp hash", thiếu thì báo chưa có nội dung. Tên và số phiếu nằm trên chuỗi nên không bị ảnh hưởng |
| U13 | Cử tri mint thẻ rồi tưởng thẻ là bằng chứng bầu cho ai | Hiểu nhầm về bí mật | Thẻ chỉ chứng minh đã **mở phiếu**, không lưu lựa chọn. Lưu ý phiếu mở vốn công khai qua sự kiện `Revealed` (TB5) |

---

## 5. Chi phí gas đã đo

Đo bằng Hardhat (Solidity 0.8.20, **optimizer tắt** cho khớp Remix), kịch bản 500 cử tri, bằng chứng Merkle sâu 9 tầng, tái lập bằng `npm run gas`. Chi tiết trước/sau tối ưu: [`GAS_REPORT.md`](GAS_REPORT.md).

### 5.1 Bảng gas

| Thao tác | Gas | Ghi chú |
| :--- | ---: | :--- |
| Triển khai `OrganizationRegistry` / `ProjectCore` / `VoterCardSBT` | 3 488 529 / 4 754 314 / 3 736 059 | một lần, nhóm trả |
| `registerOrganization` | 229 129 | một lần mỗi tổ chức |
| `createElection` (5 ứng viên) | 1 011 904 | ghi tên, hash và phiên bản hồ sơ, chụp nhóm duyệt; không phụ thuộc số cử tri (chỉ lưu root) |
| `approveElection` | 84 019 / 100 023 | lần duyệt kích hoạt tốn thêm do ghi `isActivated` và gỡ khỏi hàng chờ |
| `updateElectionMetadata` / `updateCandidateMetadata` | 73 065 / 53 457 | kèm đặt lại chữ ký |
| `commit` | ≈ 68 630 | đo ở độ sâu Merkle 9; cây nhỏ hơn thì rẻ hơn một chút |
| `reveal` (phiếu đầu của ứng viên / phiếu tiếp theo) | 89 862 / 55 662 | ô đếm phiếu từ 0 lên 1 ở phiếu đầu |
| `mint` thẻ cử tri | 128 245 | tùy chọn |
| `result` | ≈ 37 800 | hàm đọc, **0 gas** khi gọi ngoài giao dịch |

### 5.2 Chi phí quy đổi (công thức và ví dụ)

`chi phí (ETH) = gas × giá gas (gwei) × 10⁻⁹`

Cử tri tốn `68 630 + 89 862 = 158 492` gas trong trường hợp xấu nhất (phiếu đầu của ứng viên) và `68 630 + 55 662 = 124 292` gas trong trường hợp thường, chưa tính thẻ.

| Giá gas giả định | Cử tri (thường) | Cử tri (xấu nhất) | Cuộc bầu cử 60 cử tri, 5 ứng viên, 3 đại diện* |
| :--- | ---: | ---: | ---: |
| 1 gwei (L1 thấp) | 0,000124 ETH | 0,000158 ETH | ≈ 0,0088 ETH |
| 0,05 gwei (L2 điển hình, bỏ qua phí dữ liệu L1) | 0,0000062 ETH | 0,0000079 ETH | ≈ 0,00044 ETH |

\* `createElection + 2 duyệt + 60 commit + 60 reveal` ≈ 8,82 triệu gas (1 011 904 + 84 019 + 100 023 + 60 × 68 630 + 5 phiếu đầu × 89 862 + 55 phiếu sau × 55 662). Lớp 60 người có cây Merkle sâu 6 nên `commit` rẻ hơn một chút so với số đo ở độ sâu 9.

Giá gas và giá ETH thay đổi theo ngày; các cột trên là **giả định minh họa**, không phải báo giá. Nhân với giá ETH tại thời điểm nộp bài để ra USD/VND. Trên Sepolia chi phí thực là 0 đồng (ETH thử nghiệm). **Kết luận khả thi:** một cử tri tốn ≈ 0,37 USD (khoảng 9 nghìn đồng) trên L1 ở 1 gwei với ETH giả định 3 000 USD, và cỡ vài chục đồng trên L2. Với lớp/CLB vài chục người thì chấp nhận được trên L1 lúc giá gas thấp; giá gas cao thì nên chạy trên L2 hoặc để ban tổ chức tài trợ gas.

---

## 6. Phản biện của AI và câu trả lời của nhóm (Lab 08, cập nhật cho v4.0)

Prompt đã dùng: *"Bạn là người dùng thận trọng. Chỉ dựa trên SPEC và ECONOMIC_RULES… nêu 5 cách lạm dụng… chỉ rõ quy tắc nào chưa đủ chặt."* Các điểm yếu và quyết định của nhóm:

| # | Điểm yếu | Quyết định |
| :-: | :--- | :--- |
| 1 | Ban tổ chức khai sai `voterCount` để hạ quorum | **Chấp nhận rủi ro, có biện pháp**: người duyệt đối chiếu danh sách công bố; ghi rõ trong SPEC mục 6 và U4 |
| 2 | Ban tổ chức tự điều khiển ví "người duyệt" | **Chấp nhận rủi ro có biện pháp**: hợp đồng loại người tạo và ví ứng viên khai báo khỏi nhóm duyệt, còn lại dựa vào việc tổ chức chọn đại diện độc lập; người dùng kiểm `getApprovers` (U5) |
| 3 | Cử tri chờ xem tỷ số rồi mới mở phiếu hoặc bỏ | **Chấp nhận rủi ro**: không đổi thiết kế để giữ hợp đồng đơn giản; ghi nhận ở U6 |
| 4 | Mất salt = mất phiếu | **Giảm thiểu ở giao diện** (file dự phòng + nạp lại); không thể giải quyết trên chuỗi (U1) |
| 5 | Hòa phiếu không có luật phân xử | **Chủ động**: `valid = false`, bầu lại ngoài chuỗi (U7); tránh tự chế luật ngẫu nhiên có thể bị thao túng |
| 6 | Phiếu trễ / mở phiếu sau hạn | **Đã chặn trong mã**: `WrongPhase(Ended)`, có test |
| 7 | Chép cam kết, phát lại giữa cuộc bầu cử | **Đã chặn trong mã**: băm gắn `msg.sender` và `id`, có test |

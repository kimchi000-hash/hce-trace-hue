# QUY TẮC KINH TẾ — CLUB VOTING (v3.0)

- **Hợp đồng:** [`contracts/project/ProjectCore.sol`](../contracts/project/ProjectCore.sol) · **Đặc tả:** [`SPEC.md`](SPEC.md) (R1–R8)
- **Nhóm:** Nguyễn Thị Kim Chi (23K4300025), Võ Thị Thư (23K4300038)

Hệ thống này **không giữ tiền và không phát token**. "Giá trị" ở đây là **quyền biểu quyết** (một ví một phiếu, giữ kín đến lúc mở) và **chi phí gas** mà mỗi bên phải trả. Tài liệu theo bốn mục của sổ tay (dòng tiền/quyền lợi, giới hạn chống lạm dụng, quyền quản trị, tình huống người dùng bị thiệt), thêm chi phí đo thật và phản biện.

---

## 1. Dòng tiền và quyền lợi

### 1.1 Ai nhận quyền gì

| Bên | Quyền | Nguồn quyền |
| :--- | :--- | :--- |
| Ban tổ chức (người gọi `createElection`) | Đặt tên, ứng viên, mốc thời gian, quorum, danh sách cử tri (qua Merkle root), người duyệt. **Không** có quyền gì sau khi tạo | Tham số lúc tạo |
| Người duyệt (1–10 ví) | Ký xác nhận trong pha `Registration`; đủ `requiredApprovals` chữ ký thì cuộc bầu cử mới hoạt động | Do ban tổ chức chỉ định, nhưng **không được là chính ban tổ chức** |
| Cử tri | Một phiếu kín, một lần mở phiếu | Ví nằm trong danh sách Merkle |
| Người xem | Đọc mọi dữ liệu, gồm `result` sau khi kết thúc | Công khai |

Không có quyền chuyển nhượng, bán, ủy quyền phiếu, hay rút tiền: phiếu không có giá trị tiền tệ, nên không có thị trường mua phiếu trong hợp đồng.

### 1.2 Ai trả phí gì (đo thật, xem mục 5)

| Bên | Giao dịch | Gas đo được |
| :--- | :--- | ---: |
| Ban tổ chức | `createElection` (một lần mỗi cuộc) | 593 264 |
| Mỗi người duyệt | `approveElection` | 79 525 (chưa đủ ngưỡng) / 83 753 (chữ ký kích hoạt) |
| Mỗi cử tri | `commit` | ≈ 68 650 |
| Mỗi cử tri | `reveal` | 89 927 (phiếu đầu tiên của một ứng viên) / 55 727 (các phiếu sau) |
| Nhóm (một lần) | Triển khai hợp đồng | 2 619 144 |

Cử tri tự trả gas hai lần (commit + reveal). Không có phí giao thức, không có người nhận phí. Trên Sepolia, gas là ETH thử nghiệm miễn phí từ faucet; chi phí quy đổi xem mục 5.2.

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
| Người duyệt khác người tạo, không trùng, khác 0 | `InvalidParams` | Tự duyệt chính mình | Nhóm A, E |
| `MAX_CANDIDATES = 20`, `MAX_APPROVERS = 10`, tên ≤ 64 byte, tiêu đề ≤ 120 byte | `InvalidParams` | Spam dữ liệu; vòng lặp `result` vượt trần gas | Nhóm A |
| `MAX_VOTERS = 1 000 000` cho `voterCount` | `InvalidParams` | `voterCount` cực lớn làm phép nhân quorum tràn số, khiến `result()` revert vĩnh viễn (phát hiện khi tự rà soát, TB4) | Nhóm A |
| `MAX_PHASE_MINUTES = 43 200` (30 ngày) mỗi pha | `InvalidParams` | Mốc thời gian vô lý; tràn số khi nhân 60 | Nhóm A |
| Quorum ≤ 10 000 bps | `InvalidParams` | Quorum không thể đạt | Nhóm A |
| `result` chỉ ở pha `Ended` | `WrongPhase` | Dùng kết quả sớm | Nhóm E |

**Hạn chế đã biết (không chặn được trong mã, ghi nhận trung thực):** khai sai `voterCount`, người duyệt là ví giả do ban tổ chức điều khiển, và việc cử tri thấy tỷ số trong pha `Reveal` rồi quyết định không mở phiếu. Chi tiết và biện pháp giảm thiểu ở mục 4 và `SELF_AUDIT.md`.

---

## 3. Quyền quản trị

- **Không có chủ sở hữu toàn cục**, không có `onlyOwner`, không có hàm tạm dừng, nâng cấp hay rút tiền. Hợp đồng không giữ ETH nên không có gì để rút.
- **Ban tổ chức** chỉ có quyền ở khoảnh khắc `createElection`. Sau đó mọi tham số bất biến (thời hạn, quorum, root, người duyệt, ngưỡng duyệt).
- **Người duyệt** chỉ có một quyền: ký trong pha `Registration`. Không thể hủy, sửa, hay chặn cử tri đã có bằng chứng hợp lệ.
- **Không ai** (kể cả nhóm phát triển) đọc được phiếu chưa mở, xoá phiếu, hay đổi kết quả. Số phiếu chỉ tăng qua `reveal` hợp lệ.
- **Ràng buộc tin cậy còn lại:** ban tổ chức quyết định **ai là cử tri** (qua root) và **`voterCount`** (tự khai). Hai người duyệt trở lên độc lập là biện pháp kiểm soát. Muốn tin cậy hơn, nên chọn người duyệt là giảng viên/cố vấn không thuộc ban tổ chức và để họ tự dựng lại root từ danh sách công bố.

---

## 4. Tình huống người dùng bị thiệt

| # | Tình huống | Thiệt hại | Hệ thống xử lý / ai chịu rủi ro |
| :-: | :--- | :--- | :--- |
| U1 | Cử tri **mất salt** (xóa trình duyệt, đổi máy) | Không mở được phiếu → phiếu không được tính, vẫn mất phí commit | Giao diện lưu salt vào localStorage **và** tự tải file `.json` dự phòng, có nút "Nạp file dự phòng". Hợp đồng không thể khôi phục. **Chấp nhận rủi ro**: cử tri chịu |
| U2 | Cử tri **quên mở phiếu** | Phiếu không tính; nếu nhiều người quên → không đủ quorum, cả cuộc bầu cử vô hiệu | Giao diện hiện đếm ngược pha Reveal. Cuộc bầu cử vô hiệu không ai mất tiền; tổ chức lại |
| U3 | **Ví hợp lệ bị loại khỏi danh sách** (ban tổ chức bỏ sót) | Mất quyền bầu | Không sửa được trên chuỗi. Người duyệt phải đối chiếu danh sách công bố trước khi ký; thiếu người thì tạo cuộc bầu cử mới |
| U4 | Ban tổ chức khai **`voterCount` nhỏ** để hạ ngưỡng quorum | Thiểu số có thể quyết định | Không kiểm chứng được trên chuỗi. Người duyệt phải kiểm tra `voterCount` = số lá của root; công bố danh sách. **Rủi ro tin cậy người duyệt** |
| U5 | Ban tổ chức điều khiển cả các ví "người duyệt" | Chữ ký duyệt vô nghĩa | Hợp đồng chỉ chặn tự duyệt bằng chính ví tạo. Người dùng nên kiểm tra danh tính người duyệt (`getApprovers`) trước khi bỏ phiếu. **Chấp nhận rủi ro** |
| U6 | Cử tri **thấy xu hướng** trong pha Reveal rồi cố ý không mở phiếu | Bầu chiến lược; có thể làm hụt quorum | Không chặn được trong mã. Giảm thiểu: pha Reveal ngắn, ghi trong SPEC rằng bí mật chỉ bảo vệ đến lúc từng người tự mở |
| U7 | Hòa phiếu / không đủ quorum | Không có người thắng | `valid = false`; tổ chức bầu lại ngoài chuỗi |
| U8 | Cử tri nộp phiếu rồi bị lộ `salt`/máy bị chiếm trước khi mở | Người khác có thể mở phiếu thay (cần ví của cử tri để ký, nên chỉ có chủ ví) | Hợp đồng ràng `msg.sender`: không ai mở thay được nếu không có khóa ví |
| U9 | Giao dịch commit đã gửi nhưng giao diện/ mạng lỗi | Cử tri tưởng chưa nộp | Giao diện lưu salt **trước** khi gửi giao dịch và đọc lại `getVoterStatus` khi tải trang |

---

## 5. Chi phí gas đã đo

Đo bằng Hardhat (Solidity 0.8.20, **optimizer tắt** cho khớp Remix), kịch bản 500 cử tri, bằng chứng Merkle sâu 9 tầng, tái lập bằng `npm run gas`. Chi tiết trước/sau tối ưu: [`GAS_REPORT.md`](GAS_REPORT.md).

### 5.1 Bảng gas

| Thao tác | Gas | Ghi chú |
| :--- | ---: | :--- |
| Triển khai `ProjectCore` | 2 619 144 | một lần |
| `createElection` | 593 264 | không phụ thuộc số cử tri (chỉ lưu root) |
| `approveElection` | 79 525 / 83 753 | lần duyệt kích hoạt tốn thêm do ghi `isActivated` |
| `commit` | 68 652 | đo ở độ sâu Merkle 9; cây nhỏ hơn thì rẻ hơn một chút |
| `reveal` (phiếu đầu của ứng viên) | 89 927 | ô đếm phiếu từ 0 lên 1 |
| `reveal` (phiếu tiếp theo) | 55 727 | |
| `result` | ≈ 37 887 | hàm đọc, **0 gas** khi gọi ngoài giao dịch |

### 5.2 Chi phí quy đổi (công thức và ví dụ)

`chi phí (ETH) = gas × giá gas (gwei) × 10⁻⁹`

Cử tri trong trường hợp xấu nhất tốn `68 652 + 89 927 = 158 579` gas; trường hợp thường `68 652 + 55 727 = 124 379` gas.

| Giá gas giả định | Cử tri (thường) | Cử tri (xấu nhất) | Cuộc bầu cử 60 cử tri, 2 ứng viên, 1 người duyệt* |
| :--- | ---: | ---: | ---: |
| 1 gwei (L1 thấp) | 0,000124 ETH | 0,000159 ETH | ≈ 0,0082 ETH |
| 0,05 gwei (L2 điển hình, bỏ qua phí dữ liệu L1) | 0,0000062 ETH | 0,0000079 ETH | ≈ 0,00041 ETH |

\* `createElection + 1 duyệt kích hoạt + 60 commit + 60 reveal` ≈ 8,2 triệu gas (60 commit × ≈ 68,6 nghìn + 2 phiếu đầu × 89,9 nghìn + 58 phiếu sau × 55,7 nghìn + 593 nghìn + 83,8 nghìn). Lớp 60 người có cây Merkle sâu 6 nên `commit` rẻ hơn con số đo ở độ sâu 9 một chút.

Giá gas và giá ETH thay đổi theo ngày; các cột trên là **giả định minh họa**, không phải báo giá. Nhân với giá ETH tại thời điểm nộp bài để ra USD/VND. Trên Sepolia chi phí thực là 0 đồng (ETH thử nghiệm).

---

## 6. Phản biện của AI và câu trả lời của nhóm (Lab 08, cập nhật cho v3.0)

Prompt đã dùng: *"Bạn là người dùng thận trọng. Chỉ dựa trên SPEC và ECONOMIC_RULES… nêu 5 cách lạm dụng… chỉ rõ quy tắc nào chưa đủ chặt."* Các điểm yếu và quyết định của nhóm:

| # | Điểm yếu | Quyết định |
| :-: | :--- | :--- |
| 1 | Ban tổ chức khai sai `voterCount` để hạ quorum | **Chấp nhận rủi ro, có biện pháp**: người duyệt đối chiếu danh sách công bố; ghi rõ trong SPEC mục 6 và U4 |
| 2 | Ban tổ chức tự điều khiển ví "người duyệt" | **Chấp nhận rủi ro**: chỉ chặn tự duyệt bằng ví tạo; người dùng kiểm `getApprovers` (U5) |
| 3 | Cử tri chờ xem tỷ số rồi mới mở phiếu hoặc bỏ | **Chấp nhận rủi ro**: không đổi thiết kế để giữ hợp đồng đơn giản; ghi nhận ở U6 |
| 4 | Mất salt = mất phiếu | **Giảm thiểu ở giao diện** (file dự phòng + nạp lại); không thể giải quyết trên chuỗi (U1) |
| 5 | Hòa phiếu không có luật phân xử | **Chủ động**: `valid = false`, bầu lại ngoài chuỗi (U7); tránh tự chế luật ngẫu nhiên có thể bị thao túng |
| 6 | Phiếu trễ / mở phiếu sau hạn | **Đã chặn trong mã**: `WrongPhase(Ended)`, có test |
| 7 | Chép cam kết, phát lại giữa cuộc bầu cử | **Đã chặn trong mã**: băm gắn `msg.sender` và `id`, có test |

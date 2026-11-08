# LUNAR WOLF + GALAXY ARCADE K65 — Ma Sói và 05 trò chơi

Hệ thống web có **Ma Sói (16 vai đặc biệt + Dân thường)** và mục **GAME KHÁC** gồm 5 trò thực sự chơi được: **Đào vàng, Bắn bóng, Ô ăn quan, Cờ vua, Caro**. Dùng chung tài khoản / chế độ khách / avatar; có phòng đối kháng, chat trong phòng, chat cả lớp, bảng thành tích và trang quản trị nội dung. Giữ nguyên nền galaxy từ ảnh người dùng cung cấp.

## 1. Chạy game trên máy tính

**Yêu cầu:** Node.js phiên bản 20 trở lên (Node 22 được khuyến nghị). **Không cần `npm install`** vì mã nguồn chỉ sử dụng thư viện có sẵn của Node.js và công nghệ Server-Sent Events (SSE).

```bash
cd ma-soi-galaxy
npm start
```

Mở `http://localhost:3000` để chơi **Ma Sói**, hoặc `http://localhost:3000/games.html` để vào **Galaxy Arcade**. Trên website Ma Sói đã có nút **GAME KHÁC** liên kết trực tiếp.  Nếu muốn cho bạn cùng Wi‑Fi chơi ở máy khác, dùng địa chỉ LAN của máy đang chạy, ví dụ `http://192.168.1.50:3000` (cần mở port 3000 nếu bị tường lửa chặn).

Muốn đổi cổng:

```bash
PORT=4000 npm start
```

Trên Windows PowerShell:

```powershell
$env:PORT="4000"; npm start
```

## 2. Triển khai thành website công khai

Đây là **ứng dụng Node.js có máy chủ**, không phải web tĩnh. **Không thể chỉ tải mỗi `index.html` lên GitHub Pages/Netlify static rồi mong tạo phòng & chat hoạt động.**

Bạn có thể triển khai trên Railway, Render (Node web service), VPS hay một nền tảng chạy Docker. Cần:

1. Upload toàn bộ mã nguồn (hoặc kết nối Git repo).
2. Start command: `npm start` hoặc `node server.js`.
3. Đặt biến môi trường:

   | Biến | Công dụng | Ví dụ |
   |---|---|---|
   | `NODE_ENV` | Bật cookie `Secure` khi website dùng HTTPS | `production` |
   | `ADMIN_PASSWORD` | Mật khẩu mở quyền quản trị | `08022005` theo yêu cầu, **nên đổi trước khi public** |
   | `DATA_DIR` | Thư mục lưu dữ liệu tài khoản và nội dung | `/app/data` hoặc ổ đĩa bền vững |
   | `PORT` | Port do nền tảng tự cung cấp | Mặc định `3000` |
   | `APP_ORIGIN` | Nếu có reverse proxy khác host, origin chính thức | `https://game.example.com` |

4. Sử dụng tên miền **HTTPS**. Khi chạy `NODE_ENV=production`, cookie đăng nhập có cờ `Secure` nên HTTP thông thường sẽ không đăng nhập được.
5. **Gắn persistent volume/disk** vào `DATA_DIR` để giữ tài khoản, ảnh và nội dung chỉnh sửa sau mỗi lần redeploy. Không để `data/users.json` vào Git.
6. Chạy **một instance Node**. Phòng và ván đang diễn ra giữ trong RAM (sẽ mất khi máy chủ khởi động lại); tài khoản và nội dung CMS được lưu ra đĩa.

Nếu dùng Docker:

```bash
docker build -t lunar-wolf .
docker run -p 3000:3000 -e NODE_ENV=production -e ADMIN_PASSWORD='MẬT_KHẨU_MỚI' -v lunar-data:/app/data lunar-wolf
```

## 3. Đăng nhập, chế độ khách và avatar

- **Đăng ký:** nhập biệt danh và mã `DDMMYYYY` 8 chữ số. Server dùng `scrypt` + muối ngẫu nhiên để lưu **hash**, không lưu mã ngày sinh dạng văn bản.
- **Đăng nhập:** dùng lại biệt danh và mã cũ.
- **Khách:** chỉ nhập biệt danh, không cần tạo tài khoản. Khách cũng được tạo phòng, tham gia, chat và nhận vai. Tài khoản khách mất khi máy chủ khởi động lại.
- **Ảnh đại diện:** chọn ảnh JPG/PNG/WebP, trình duyệt thu nhỏ ảnh trước khi lưu. Ảnh hiển thị cho những người trong cùng phòng.
- **Người xem:** bật ô “Chỉ xem” khi vào phòng. Người xem không có vai, không bỏ phiếu và không chat khi ván đang diễn ra.

**Lưu ý bảo mật:** ngày sinh là mật khẩu dễ đoán. Mã ngày sinh được thực hiện theo yêu cầu để sử dụng trong lớp học, **không phù hợp cho tài khoản chứa dữ liệu nhạy cảm**. Nếu định public rộng rãi, hãy đổi cơ chế đăng nhập sang mật khẩu riêng/mã một lần. Đã có giới hạn 9 lần đăng nhập/admin sai mỗi 15 phút theo IP và tên tài khoản.

File danh sách lớp được đính kèm **không có cột ngày sinh**, nhưng có tên và thông tin liên hệ. Vì vậy app **không nhập/đóng gói danh sách lớp, số điện thoại hoặc email** vào trang web. Mỗi bạn tự đăng ký biệt danh, tránh lộ dữ liệu cá nhân khi deploy.

## 4. Tạo phòng và chơi

1. Một người tạo phòng, gửi **mã 6 ký tự** cho bạn khác.
2. Bạn khác nhập mã để vào. Phòng chứa tối đa 5–60 người chơi (mặc định 60, chủ phòng thay đổi được). Người xem không chiếm suất người chơi.
3. Chủ phòng có thể điều chỉnh: danh sách vai có thể xuất hiện, thời gian Đêm/Thảo luận/Bỏ phiếu và sức chứa.
4. Tất cả người chơi nhấn **Tôi đã sẵn sàng**. Cần tối thiểu **5 người** để bắt đầu.
5. Trình tự: **Đêm** (vai sử dụng năng lực) → **Ngày** (chat, suy luận) → **Bỏ phiếu** (loại người nghi là Sói) → đêm tiếp theo. Máy chủ tự chuyển khi hết giờ; chủ phòng cũng có thể chuyển sớm.
6. Chỉ người sở hữu vai mới thấy lá bài của mình; Vai của người đã chết được công khai. Các thành viên phe Sói thấy tên đồng đội và chat riêng lúc đêm.
7. Phe Dân thắng khi loại hết Sói. Phe Sói thắng khi số Sói còn sống lớn hơn hoặc bằng số Dân. Có ngoại lệ đặc biệt cho Sói Trắng và cặp tình nhân khác phe.
8. Sau khi kết thúc, chủ phòng nhấn **Tạo ván mới** để chơi lại, không cần mời lại.

### 16 vai đặc biệt

| Phe Sói | Phe Dân |
|---|---|
| Ma Sói, Sói Trắng, Sói Con, Sói Câm Lặng | Tiên Tri, Phù Thủy, Bảo Vệ, Thợ Săn, Thần Tình Yêu, Cáo, Già Làng, Kẻ Ngốc, Hoàng Tử, Linh Mục, Thám Tử, Quạ Đen, và Dân Thường (cơ bản) |

**Chú ý:** Bộ bài tự chọn vai theo số người và các vai chủ phòng đã cho phép. Ván ít người không thể chứa cả 16 vai. Đây là **biến thể Ma Sói riêng của app**, có luật mô tả rõ ở thẻ nhân vật; một số vai được đơn giản hóa để phù hợp khi chơi online tự động (ví dụ: Phù Thủy chọn người cứu mà không thấy nạn nhân Sói; Thợ Săn đặt trước mục tiêu trả thù).

## 5. Quản trị nội dung và chỉnh chữ

1. Đăng nhập bằng tài khoản thường hoặc chế độ khách.
2. Nhấn biểu tượng **⚙** trên thanh menu.
3. Nhập mật khẩu admin (`08022005` **trong bản chạy cục bộ mặc định**; trên production phải cấu hình `ADMIN_PASSWORD`).
4. Chọn **Văn bản giao diện**, **16 vai & mô tả** hoặc **🕹️ Mini Games**.
5. Chỉnh sửa trực tiếp và nhấn **Lưu toàn bộ nội dung**. Thay đổi được lưu tại `data/content.json` và đẩy realtime tới các trình duyệt đang kết nối.

**Vùng tùy chỉnh:** tất cả nội dung đã khai báo trong `content.seed.json`, bao gồm nhãn khu game, tên, tiêu đề phụ, mô tả và hướng dẫn của cả 5 game: tiêu đề, lời giới thiệu, menu, các nút chính, hướng dẫn, luật chơi, nhãn điều khiển và tên/mô tả của cả 17 thẻ (16 vai đặc biệt + Dân thường). Luật các mini game nằm trong `arcade.js` và `chess-engine.js`; đổi mô tả không thay đổi luật. Cơ chế sức mạnh của từng vai nằm trong `game.js`; đổi phần mô tả không tự đổi luật xử lý của máy chủ. Một số thông báo hệ thống kỹ thuật có mẫu cố định trong code; muốn thay cả những câu này thì có thể sửa mã nguồn Node.

## 6. Cấu trúc thư mục

```text
ma-soi-galaxy/
├── server.js                  # REST API, SSE, sessions, lưu nội dung/tài khoản
├── arcade.js                  # 05 game: phòng riêng, bảng điểm, luật Caro/Ô ăn quan, chat
├── chess-engine.js            # Luật Cờ vua đầy đủ, nước đi hợp lệ trên server
├── game.js                    # Chia vai, xử lý hành động, bỏ phiếu, thắng thua
├── roles.js                   # Danh mục metadata 16 vai + dân thường
├── content.seed.json          # Văn bản mặc định chỉnh được
├── public/
│   ├── index.html             # Trang Ma Sói
│   ├── games.html             # Mục GAME KHÁC / khu mini game
│   ├── games.js               # UI + canvas Đào vàng và Bắn bóng + bàn đối kháng
│   ├── games.css              # CSS khu game responsive
│   ├── app.js                 # Frontend JS
│   ├── styles.css             # Giao diện responsive
│   ├── galaxy.jpg             # Ảnh nền bạn cung cấp
│   └── favicon.svg
├── tests/game.test.js         # Bộ kiểm thử logic vai
├── data/                      # DB JSON, nội dung chỉnh sửa (không đưa lên Git)
├── Dockerfile
├── package.json
└── README.md
```

## 7. Kiểm thử

```bash
npm test
```

21 bài test tự động (bao gồm 5 kiểm thử mini game mới) kiểm tra chia vai, che vai bí mật, Tiên Tri, Bảo Vệ, Phù Thủy, tình nhân, Thợ Săn, Kẻ Ngốc, Hoàng Tử, Quạ Đen, Sói Con, Cáo và Sói Trắng.

## 8. Mini game Galaxy Arcade — cách chơi

| Trò | Chế độ | Điều khiển / luật cơ bản |
|---|---|---|
| **⛏ Đào vàng** | Chơi đơn | 60 giây. Nhấn `Space`, click hoặc chạm để thả móc đang lắc. Hàng nặng kéo chậm, kim cương điểm cao. |
| **🫧 Bắn bóng** | Chơi đơn | Nhấp/chạm để bắn bóng; nhóm 3+ đồng màu sẽ nổ. Nhóm không còn kết nối trần sẽ rơi. |
| **🏺 Ô ăn quan** | 2 người / phòng | Chọn một ô bên mình, chọn chiều trái/phải rải 1 quân qua 12 ô; tính điểm, hai ô quan, rải lại bằng 5 điểm khi cần. **Biến thể giản lược** của trò truyền thống. |
| **♟ Cờ vua** | 2 người / phòng | Máy chủ xác thực nước đi hợp lệ; hỗ trợ nhập thành, bắt tốt qua đường, phong cấp, chiếu hết, hòa. Nhấp quân rồi chọn ô đích. |
| **✕ Caro** | 2 người / phòng | Bàn 15×15. X đi trước; 5 quân liên tiếp là thắng. Luật freestyle, **không có luật chặn hai đầu**. |

### Chơi cùng bạn

1. Đăng nhập ở Ma Sói hoặc dùng tên khách trực tiếp tại `games.html`.
2. Nhấn **GAME KHÁC** > chọn **Cờ vua, Ô ăn quan hoặc Caro**.
3. Chọn **Tạo phòng**; gửi mã 6 ký tự. Người thứ hai dùng mã để vào; người khác vào xem.
4. Hai bên luân phiên đi; máy chủ kiểm tra lượt hợp lệ. Có chat **Trong phòng** và chat **Cả lớp**. Người xem cũng được thảo luận; chủ phòng có thể mở ván tiếp sau khi kết thúc.
5. Tại sảnh, các thành viên đang đăng nhập/khách đều được chat chung, xem phòng đang mở và bảng thành tích. Người gửi có thể xóa lời nhắn của mình; admin mở khóa trên trang Ma Sói có thể xóa lời nhắn người khác.

**Điểm số:** bảng thành tích lưu tại `data/arcade-scores.json`. Chơi đơn ghi **điểm cao nhất**; các game đối kháng ghi **số trận thắng**. Đào vàng / Bắn bóng tính vật lý ở trình duyệt và máy chủ chỉ kiểm tra phiên chơi, điểm tối đa, thời gian tối thiểu; **chưa có cơ chế chống gian lận mạnh**, không dùng bảng điểm để trao thưởng thật. Các phòng mini game và chat đang giữ trong RAM; mất khi khởi động lại máy chủ.

**Ghi chú:** bản Cờ vua là người-vs-người, **chưa có AI để đánh với máy**, đồng hồ và chức năng xin hòa; Caro và Ô ăn quan cũng cần hai người thật. Trò Đào vàng và Bắn bóng chơi một mình (cùng cạnh tranh trên bảng điểm).

## 9. Giới hạn bản đầu

- Phòng/trận Ma Sói và mini game cùng chat lưu RAM, mất khi server khởi động lại (không mất dữ liệu tài khoản, bảng thành tích và CMS nếu đã gắn ổ đĩa).
- Chỉ hỗ trợ một Node instance. Nếu tăng lên hàng nghìn người cùng lúc, cần Redis/pubsub và cơ sở dữ liệu chính thức.
- Không có xác thực ngày sinh dựa trên danh sách lớp; người chơi tự chọn nickname/PIN.
- Không hỗ trợ âm thanh/voice/video; chat bằng chữ realtime.
- Web này dùng SSE + HTTP POST để cập nhật realtime; proxy cần hỗ trợ kết nối HTTP streaming dài.
- Chủ phòng có thể chuyển pha thủ công, vì vậy nên chọn bạn tổ chức tin cậy.

© Bản game phục vụ chơi nhóm/lớp học. Hãy tránh đăng tải công khai dữ liệu cá nhân của các thành viên.

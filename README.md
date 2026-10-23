# Quick Apply cho Premiere Pro

Bảng tìm kiếm mọi thứ trong Premiere Pro — giống **Quick Apply** của After Effects. Bấm phím tắt, gõ tên, `Return` là chạy.

- Tìm effect, transition, sequence, clip, bin, script, `.mogrt`, extension và các lệnh hay dùng trong một ô.
- Không phân biệt dấu tiếng Việt, gõ tắt được (`gblur` → *Gaussian Blur*), nhiều từ (`blur fast`). Lệnh hay dùng tự lên đầu.
- Phím tắt toàn cục để mở bảng (mặc định **`Cmd+F`**, macOS), và gán phím riêng cho từng lệnh.

Hỗ trợ Premiere Pro 2023 – 2026 (v23 trở lên) trên **macOS** và **Windows**.

## Cài đặt

1. Tải `QuickApply-vX.Y.Z.zip` ở mục [Releases](../../releases/latest) và **giải nén**.
2. Chạy file cài:
   - **macOS:** chuột phải `install_mac.command` → *Open* → *Open*.
   - **Windows:** double-click `install_windows.bat`.
     Nếu SmartScreen hiện cảnh báo, bấm *More info* → *Run anyway*.
3. Khởi động lại Premiere Pro → bấm **`Cmd+F`** (macOS) hoặc mở **Window › Extensions › Quick Apply**.

Trình cài copy panel vào thư mục extension của người dùng và bật `PlayerDebugMode` để Premiere cho phép chạy extension chưa ký. Không cần quyền admin.

| | Thư mục cài |
|---|---|
| macOS | `~/Library/Application Support/Adobe/CEP/extensions/QuickApply_PR` |
| Windows | `%APPDATA%\Adobe\CEP\extensions\QuickApply_PR` |

Gỡ cài đặt: chạy `uninstall_mac.command` hoặc `uninstall_windows.bat`.

## Tìm được những gì

| Nhóm | Khi chạy (`Return` / nút Run) |
|---|---|
| Video / Audio Effects | Áp vào các clip đang chọn trên timeline |
| Video / Audio Transitions | 1 clip chọn: thêm vào 2 đầu · nhiều clip: thêm vào cuối mỗi clip (độ dài chỉnh trong Settings) |
| Sequences | Mở sequence |
| Clips trong Project | Overwrite tại playhead lên track video đang target |
| Bins | Chọn bin trong Project panel |
| Scripts (`.jsx` / `.jsxbin`) | Chạy script — thêm thư mục trong Settings (🔧) |
| Motion Graphics Templates (`.mogrt`) | Chèn tại playhead lên track đang target |
| Extensions | Mở panel giống Window › Extensions |
| Commands | Save, Add Marker, Razor tất cả track, Set/Clear In-Out, Export Frame PNG, Enable/Disable, Scale to Frame Size, Link/Unlink, Remove Effects |

Chưa hỗ trợ: plugin UXP, panel có sẵn của Premiere (Lumetri, Effect Controls…) và effect preset `.prfpset` — Premiere không có API cho những mục này.

## Phím tắt

### Mở bảng tìm kiếm (macOS)

- Mặc định **`Cmd+F`**: đang ở đâu trong Premiere cũng bấm được, bật cửa sổ Quick Apply nổi → gõ → `Return` chạy và cửa sổ tự đóng. `Esc` hoặc click ra ngoài cũng đóng.
- Đổi phím: 🔧 Settings → *Open Quick Apply › Hotkey* → bấm nút rồi nhấn tổ hợp mới.
- Phím chỉ bị giữ khi Premiere là app phía trước; ở app khác vẫn hoạt động bình thường.
- Chạy bằng một helper nhỏ (`extension/helper/qa_hotkey`) tự khởi động cùng Premiere.

Trên Windows chưa có phím tắt toàn cục — dùng panel Quick Apply dock trong workspace.

### Phím riêng cho từng lệnh (tuỳ chọn)

Chọn dòng → bấm nút cạnh *Keyboard Shortcut* → nhấn tổ hợp phím (cần Ctrl/Cmd/Opt hoặc F1–F12). `Esc` huỷ, `⌫` xoá. Chạy khi cửa sổ Quick Apply đang được focus. Danh sách xem/xoá trong Settings.

Điều khiển: `↑ ↓` chọn · `Return` chạy · `Esc` xoá ô tìm / đóng · double-click để chạy.

## Build

```bash
./build.sh   # build lại helper (universal arm64 + x86_64) và đóng gói dist/QuickApply-vX.Y.Z.zip
```

## License

MIT

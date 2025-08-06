import requests
import uuid
from flask import Flask, request, jsonify
import time
import threading
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API_BASE = 'https://public.funlink.io/api/'
ORIGIN = 'https://88bet.hiphop'
HEADERS_TEMPLATE = {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "vi,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Origin": ORIGIN,
    "Priority": "u=1, i",
    "Referer": ORIGIN + "/",  # đảm bảo có dấu /
    "Sec-CH-UA": '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
}


# Lưu trữ trạng thái các rid
rid_status = {}

# Khóa để đồng bộ hóa truy cập rid_status
lock = threading.Lock()

def generate_rid():
    return str(uuid.uuid4())

def create_payload():
    return {
        "browser_major_version": "138",
        "screen": "1920 x 1080",
        "os_version": "10",
        "os_name": "Windows",
        "browser_name": "Chrome",
        "browser_version": "138.0.0.0",
        "is_mobile": False,
        "is_cookies": True,
        "href": ORIGIN,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "hostname": ORIGIN
    }

def trigger_code(rid):
    print(f"[Thread] Bắt đầu xử lý RID: {rid}")
    headers = {**HEADERS_TEMPLATE, "rid": rid}
    try:
        # Gửi yêu cầu OPTIONS
        resp = requests.options(API_BASE + "code/ch", headers=headers, timeout=10)
        print(f"[Thread] OPTIONS status: {resp.status_code}")
        with lock:
            if resp.status_code != 200:
                rid_status[rid] = {"status": "error", "message": f"Request failed with status {resp.status_code}", "created_at": time.time()}
                return

        # Đếm ngược 50s
        for i in range(50, -1, -1):  # Đếm từ 50 xuống 0
            print(f"[Thread] RID: {rid} - time_left: {i}")
            with lock:
                rid_status[rid] = {"status": "waiting", "time_left": i, "created_at": time.time()}
            time.sleep(1)

        # Lấy mã code
        code_data = requests.post(API_BASE + "code/code", headers=headers, json=create_payload(), timeout=10)
        print(f"[Thread] POST code response: {code_data.status_code}")
        with lock:
            if code_data.status_code == 200:
                rid_status[rid] = {"status": "success", "code": code_data.json().get("code"), "created_at": time.time()}
            else:
                rid_status[rid] = {"status": "error", "message": f"Failed to fetch code, status {code_data.status_code}", "created_at": time.time()}
    except Exception as e:
        print(f"[Thread] Lỗi xảy ra: {e}")
        with lock:
            rid_status[rid] = {"status": "error", "message": str(e), "created_at": time.time()}

@app.route('/gettask', methods=['POST'])
def get_task():
    rid = generate_rid()
    with lock:
        rid_status[rid] = {"status": "waiting", "time_left": 50, "created_at": time.time()}
    print(f"[API] Tạo RID mới: {rid}")
    threading.Thread(target=trigger_code, args=(rid,), daemon=True).start()
    return jsonify({"rid": rid})

@app.route('/task', methods=['POST'])
def check_task():
    rid = request.json.get('rid')
    with lock:
        if not rid or rid not in rid_status:
            return jsonify({"status": "error", "message": "Invalid or missing rid"}), 400
        status = rid_status[rid]
    
    if status["status"] == "waiting":
        return jsonify({"status": "waiting", "time_left": status["time_left"]})
    elif status["status"] == "success":
        with lock:
            code = status["code"]
            rid_status.pop(rid, None)  # Xóa RID sau khi trả về thành công
        return jsonify({"status": "success", "code": code})
    else:
        with lock:
            rid_status.pop(rid, None)  # Xóa RID nếu có lỗi
        return jsonify({"status": "error", "message": status["message"]})
def cleanup_rid_status():
    while True:
        with lock:
            current_time = time.time()
            expired_rids = [rid for rid, status in rid_status.items() 
                           if status["status"] == "waiting" and current_time - status.get("created_at", current_time) > 60]
            for rid in expired_rids:
                rid_status.pop(rid, None)
        time.sleep(120)  # Kiểm tra mỗi 60 giây

# Khởi động thread dọn dẹp
threading.Thread(target=cleanup_rid_status, daemon=True).start()

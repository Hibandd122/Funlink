import requests
import uuid
from flask import Flask, request, jsonify
import time
import threading

app = Flask(__name__)

API_BASE = 'https://public.funlink.io/api/'
ORIGIN = 'https://88bet.hiphop'
HEADERS_TEMPLATE = {
    "Content-Type": "application/json",
    "Referer": ORIGIN,
    "Origin": ORIGIN
}

# Lưu trữ trạng thái các rid
rid_status = {}

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
    headers = {**HEADERS_TEMPLATE, "rid": rid}
    try:
        resp = requests.options(API_BASE + "code/ch", headers=headers, timeout=10)
        if resp.status_code != 200:
            rid_status[rid] = {"status": "error", "message": f"Request failed with status {resp.status_code}"}
            return

        # Đợi 50s
        for i in range(50, 0, -1):
            rid_status[rid] = {"status": "waiting", "time_left": i}
            time.sleep(1)

        # Lấy mã code
        code_data = requests.post(API_BASE + "code/code", headers=headers, json=create_payload())
        if code_data.status_code == 200:
            rid_status[rid] = {"status": "success", "code": code_data.json().get("code")}
        else:
            rid_status[rid] = {"status": "error", "message": f"Failed to fetch code, status {code_data.status_code}"}
    except Exception as e:
        rid_status[rid] = {"status": "error", "message": str(e)}

@app.route('/gettask', methods=['POST'])
def get_task():
    rid = generate_rid()
    rid_status[rid] = {"status": "waiting", "time_left": 50}
    threading.Thread(target=trigger_code, args=(rid,)).start()
    return jsonify({"rid": rid})

@app.route('/task', methods=['POST'])
def check_task():
    rid = request.json.get('rid')
    if not rid or rid not in rid_status:
        return jsonify({"status": "error", "message": "Invalid or missing rid"}), 400

    status = rid_status[rid]
    if status["status"] == "waiting":
        return jsonify({"status": "waiting", "time_left": status["time_left"]})
    elif status["status"] == "success":
        return jsonify({"status": "success", "code": status["code"]})
    else:
        return jsonify({"status": "error", "message": status["message"]})

if __name__ == "__main__":
    app.run(debug=True)

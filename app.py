import time, uuid, requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API = "https://public.funlink.io/api/"
DEST = "https://caraworldcamranh.land/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
KEYWORD_TEXT = "Caraworld Cam Ranh"
KEYWORD_ID = "7043c47f-9807-4ee5-b78f-406b1a56b477"

pending = {}

@app.route("/", methods=["POST"])
def create_rid():
    url = request.json.get("url")
    if not url or "funlink.io" not in url:
        return jsonify({"error": "Invalid link"}), 400

    rid = str(uuid.uuid4())
    link_id = url.strip("/").split("/")[-1]
    start_time = time.time()

    pending[rid] = {"start": start_time, "link_id": link_id}

    try:
        requests.options(f"{API}code/ch", headers={"rid": rid}, timeout=10)
    except Exception as e:
        return jsonify({"error": f"OPTIONS failed: {str(e)}"}), 500

    return jsonify({"rid": rid})


@app.route("/<rid>", methods=["POST"])
def check_rid(rid):
    entry = pending.get(rid)
    if not entry:
        return jsonify({"error": "RID not found"}), 404

    elapsed = time.time() - entry["start"]
    time_left = max(0, 45 - int(elapsed))
    if time_left > 0:
        return jsonify({"timeleft": time_left})

    link_id = entry["link_id"]
    headers = {
        "referer": DEST,
        "rid": rid,
        "user-agent": UA
    }

    payload_code = {
        "screen": "1920x1080",
        "browser_name": "Chrome",
        "browser_version": "137.0.0.0",
        "is_mobile": False,
        "is_cookies": True,
        "href": DEST,
        "user_agent": UA,
        "hostname": DEST
    }

    try:
        res = requests.post(f"{API}code/code", headers=headers, json=payload_code, timeout=10)
        code = res.json().get("code")
        if not code:
            return jsonify({"error": "No code returned"}), 500

        payload_track = {
            "browser_name": "Chrome",
            "browser_version": "137.0.0.0",
            "os_name": "Windows",
            "os_version": "10",
            "os_version_name": "137",
            "keyword_answer": code,
            "link_shorten_id": link_id,
            "keyword": KEYWORD_TEXT,
            "ip": "",
            "user_agent": UA,
            "device_name": "desktop",
            "token": "",
            "keyword_id": KEYWORD_ID
        }

        track = requests.post(f"{API}url/tracking-url", headers=headers, json=payload_track, timeout=10)
        final_url = track.json().get("data_link", {}).get("url")
        if not final_url:
            return jsonify({"error": "No final URL"}), 500

        pending.pop(rid, None)  # Xoá sau khi xong
        return jsonify({"redirect": final_url})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

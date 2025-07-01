import time, uuid, requests
from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API = "https://public.funlink.io/api/"
DEST = "https://caraworldcamranh.land/"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
KEYWORD_TEXT = "Caraworld Cam Ranh"
KEYWORD_ID = "7043c47f-9807-4ee5-b78f-406b1a56b477"

@app.route("/", methods=["GET"])
def index():
    return render_template_string("""
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xử lý Liên kết Funlink</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-blue-100 via-white to-blue-200 min-h-screen flex items-center justify-center">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-8">
    <h1 class="text-3xl font-bold text-center text-blue-700 mb-6">
      🎯 Xử lý Liên kết Funlink.io
    </h1>

    <div class="space-y-4">
      <input id="urlInput" type="text" placeholder="Dán URL chứa 'funlink.io'" 
             class="w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700">

      <button id="submitBtn" class="w-full bg-blue-600 text-white py-3 rounded-xl text-lg font-medium hover:bg-blue-700 transition">
        🚀 Bắt đầu xử lý
      </button>

      <div id="progressWrapper" class="hidden">
        <div class="mt-2 mb-1 text-center text-gray-700 font-medium">
          ⏳ Đang đợi xử lý: <span id="countdown">45</span>s
        </div>
        <div class="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
          <div id="progressBar" class="h-full bg-blue-500 transition-all duration-100 ease-linear" style="width: 0%"></div>
        </div>
      </div>

      <div id="success" class="text-center text-green-600 font-semibold hidden"></div>
      <div id="error" class="text-center text-red-500 font-medium hidden"></div>
    </div>
  </div>

  <script>
    const urlInput = document.getElementById("urlInput");
    const submitBtn = document.getElementById("submitBtn");
    const errorDiv = document.getElementById("error");
    const successDiv = document.getElementById("success");
    const countdownSpan = document.getElementById("countdown");
    const progressWrapper = document.getElementById("progressWrapper");
    const progressBar = document.getElementById("progressBar");

    function showElement(el, text = null, visible = true) {
      if (text !== null) el.innerHTML = text;
      el.classList.toggle("hidden", !visible);
    }

    function generateRID() {
      return crypto.randomUUID();
    }

    submitBtn.addEventListener("click", () => {
      const url = urlInput.value.trim();
      if (!url || !url.includes("funlink.io")) {
        showElement(errorDiv, "⚠️ Vui lòng nhập URL hợp lệ chứa 'funlink.io'", true);
        showElement(successDiv, "", false);
        progressWrapper.classList.add("hidden");
        return;
      }

      const rid = generateRID();
      submitBtn.disabled = true;
      urlInput.disabled = true;
      showElement(errorDiv, "", false);
      showElement(successDiv, "", false);
      progressWrapper.classList.add("hidden");

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, rid, step: "prepare" })
      })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          submitBtn.disabled = false;
          urlInput.disabled = false;
          showElement(errorDiv, data.error, true);
          return;
        }

        let time = 45;
        let percent = 0;
        showElement(countdownSpan, `${time}`);
        progressWrapper.classList.remove("hidden");
        progressBar.style.width = `0%`;

        const interval = setInterval(() => {
          time--;
          percent = ((45 - time) / 45) * 100;
          showElement(countdownSpan, `${time}`);
          progressBar.style.width = `${percent}%`;

          if (time <= 0) {
            clearInterval(interval);

            fetch("/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url, rid, step: "run" })
            })
            .then(res => res.json())
            .then(data => {
              submitBtn.disabled = false;
              urlInput.disabled = false;
              progressWrapper.classList.add("hidden");
              if (data.error) {
                showElement(errorDiv, "❌ " + data.error, true);
              } else if (data.redirect) {
                showElement(successDiv, `✅ <a href="${data.redirect}" target="_blank" class="text-blue-600 underline">Chuyển hướng tới: ${data.redirect}</a>`, true);
              }
            })
            .catch(err => {
              submitBtn.disabled = false;
              urlInput.disabled = false;
              progressWrapper.classList.add("hidden");
              showElement(errorDiv, `❌ Lỗi: ${err.message}`, true);
            });
          }
        }, 1000);
      })
      .catch(err => {
        submitBtn.disabled = false;
        urlInput.disabled = false;
        showElement(errorDiv, `❌ Lỗi chuẩn bị: ${err.message}`, true);
        progressWrapper.classList.add("hidden");
      });
    });
  </script>
</body>
</html>
""")

@app.route("/", methods=["POST"])
def handle_request():
    data = request.json
    url = data.get("url")
    rid = data.get("rid")
    step = data.get("step", "run")

    if not rid:
        return jsonify({"error": "Thiếu RID"}), 400

    if step == "prepare":
        try:
            requests.options(f"{API}code/ch", headers={"rid": rid}, timeout=10)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": f"OPTIONS lỗi: {str(e)}"}), 500

    if not url or "funlink.io" not in url:
        return jsonify({"error": "URL không hợp lệ"}), 400

    link_id = url.strip("/").split("/")[-1]
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
            return jsonify({"error": "Không nhận được mã code"}), 500

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
            return jsonify({"error": "Không tìm thấy link chuyển hướng"}), 500

        return jsonify({"redirect": final_url})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

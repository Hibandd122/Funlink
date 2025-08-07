from flask import Flask, request, jsonify

app = Flask(__name__)

# Hàm load file mỗi lần gọi API
def load_results(file_path='results.txt'):
    result_map = {}
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if '|' in line:
                image_url, link = map(str.strip, line.split('|', 1))
                result_map[image_url] = link
    return result_map

@app.route('/get-link', methods=['POST'])
def get_link():
    data = request.get_json()
    image_url = data.get('image_url')

    if not image_url:
        return jsonify({'error': 'Missing image_url'}), 400

    # Luôn reload file mỗi lần có request
    results_data = load_results()

    link = results_data.get(image_url)
    if link:
        return jsonify({'link': link})
    else:
        return jsonify({'error': 'Image URL not found'}), 404

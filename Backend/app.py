from flask import Flask, request, jsonify
from flask_cors import CORS
from main import simulate, get_locations

app = Flask(__name__)
CORS(app)


@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/locations", methods=["GET"])
def locations():
    return jsonify({
        "error": False,
        "locations": get_locations()
    })


@app.route("/simulate", methods=["POST"])
def run_simulation():
    try:
        data = request.get_json() or {}

        start = data.get("start")
        end = data.get("end")
        hazard = data.get("hazard", "Flood")

        result = simulate(start, end, hazard)
        return jsonify(result)

    except Exception as e:
        return jsonify({
            "error": True,
            "message": str(e)
        }), 500


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
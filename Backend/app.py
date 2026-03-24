from flask import Flask, request, jsonify
from flask_cors import CORS
from main import simulate, get_locations

app = Flask(__name__)
CORS(app)

@app.route("/simulate", methods=["POST"])
def run_simulation():
    data = request.json or {}
    start = data.get("start")
    end = data.get("end")
    hazard = data.get("hazard", "Flood")

    result = simulate(start, end, hazard)
    return jsonify(result)

@app.route("/locations", methods=["GET"])
def locations():
    return jsonify({
        "error": False,
        "locations": get_locations()
    })

if __name__ == "__main__":
    app.run(debug=True)
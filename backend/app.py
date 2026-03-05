from flask import Flask, request, jsonify
from main import simulate

app = Flask(__name__)

@app.route("/simulate", methods=["POST"])
def run_simulation():
    data = request.json

    start = data.get("start")
    end = data.get("end")
    hazard = data.get("hazard", "Flood")

    result = simulate(start, end, hazard)

    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
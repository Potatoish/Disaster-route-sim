from pathlib import Path

import pandas as pd


DATA_DIR = Path(__file__).resolve().parent
NODE_COLUMNS = ["id", "name", "lat", "lng", "barangay", "node_type"]


def _repair_bad_line(row, expected_columns):
    if len(row) == len(expected_columns):
        return row

    if expected_columns == NODE_COLUMNS and len(row) > len(expected_columns):
        repaired_name = ", ".join(part.strip() for part in row[1:-4])
        return [row[0], repaired_name, *row[-4:]]

    return row


def _load_csv(primary_name, fallback_names=(), required_columns=None):
    for file_name in (primary_name, *fallback_names):
        file_path = DATA_DIR / file_name
        if not file_path.exists():
            continue

        try:
            frame = pd.read_csv(file_path)
        except pd.errors.ParserError:
            frame = pd.read_csv(
                file_path,
                engine="python",
                on_bad_lines=lambda row: _repair_bad_line(row, required_columns or []),
            )
        missing_columns = [
            column
            for column in (required_columns or [])
            if column not in frame.columns
        ]
        if missing_columns:
            raise ValueError(
                f"{file_name} is missing required column(s): {', '.join(missing_columns)}"
            )
        return frame, None

    return pd.DataFrame(columns=required_columns or []), FileNotFoundError(
        f"Could not find any of: {', '.join((primary_name, *fallback_names))}"
    )


nodes, _NODES_LOAD_ERROR = _load_csv(
    "nodes.csv",
    fallback_names=("node.csv",),
    required_columns=NODE_COLUMNS,
)


def _fetch_nodes():
    return list(
        nodes.loc[:, ["id", "name", "lat", "lng", "barangay"]]
        .itertuples(index=False, name=None)
    )


def get_nodes():
    print("Fetching node locations from CSV...")

    try:
        if _NODES_LOAD_ERROR is not None:
            raise _NODES_LOAD_ERROR

        node_rows = _fetch_nodes()
        print(f"Fetched {len(node_rows)} node location(s).")
        return node_rows
    except Exception as e:
        print("Node fetch error:", e)
        return None


def get_location_by_name(name):
    try:
        if _NODES_LOAD_ERROR is not None:
            raise _NODES_LOAD_ERROR

        normalized_name = (name or "").strip()
        if not normalized_name:
            return None

        matched_rows = nodes.loc[
            nodes["name"].astype(str).str.strip() == normalized_name,
            ["id", "name", "lat", "lng", "barangay"],
        ]
        if matched_rows.empty:
            return None

        row = matched_rows.iloc[0]
        return {
            "id": int(row["id"]),
            "name": row["name"],
            "lat": float(row["lat"]),
            "lng": float(row["lng"]),
            "barangay": row["barangay"],
        }
    except Exception as e:
        print("Location fetch error:", e)
        return None

import csv
import json
import os
import re
from collections import defaultdict


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(ROOT_DIR, "SE_Import_File .csv")
OUT_PATHS = [
    os.path.join(ROOT_DIR, "src", "assets", "ems_config.json"),
    os.path.join(ROOT_DIR, "ems_config_utf8.json"),
]


def parse_section_title(name_value: str, se_token: str) -> str | None:
    """Extract section title from the CSV `name` column.

    Expected pattern (split on '-'):
      CLINIC - Standards - SE{n} - {SE Name} - {section_id} {section_title} - {criterion text}
    """
    if not name_value:
        return None
    parts = name_value.split("-")
    try:
        idx = parts.index(se_token)
        section_part = parts[idx + 2].strip()
    except (ValueError, IndexError):
        return None

    # section_part like "1.2 Facility Management"
    if " " in section_part:
        return section_part.split(" ", 1)[1].strip()
    return section_part or None


def build_config_from_csv() -> dict:
    se_map: dict[int, dict] = {}

    with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("code") or "").strip()
            name = (row.get("name") or "").strip()
            desc = (row.get("Description") or "").strip()

            if not code.startswith("CLINIC-Standards-SE"):
                continue

            code_parts = code.split("-")
            if len(code_parts) < 5:
                continue

            se_token = code_parts[2]  # e.g. "SE1"
            m = re.match(r"SE(\d+)", se_token)
            if not m:
                continue
            se_id = int(m.group(1))
            se_name = code_parts[3].strip()

            numeric = code_parts[4].strip()  # e.g. "1.2.1.3"
            nums = numeric.split(".")
            if len(nums) != 4 or not all(n.isdigit() for n in nums):
                continue
            a, b, c, d = nums

            section_id = f"{a}.{b}"
            standard_id = f"{a}.{b}.{c}"
            crit_id = f"{a}.{b}.{c}.{d}"

            se_entry = se_map.setdefault(
                se_id,
                {
                    "se_id": se_id,
                    "se_name": se_name,
                    "sections": {},  # section_id -> section dict
                },
            )

            # If we ever see a different se_name for same se_id, prefer the first one.
            if se_entry["se_name"] != se_name:
                # Keep the original, ignore later variations.
                pass

            sections = se_entry["sections"]
            section = sections.setdefault(
                section_id,
                {
                    "section_pi_id": section_id,
                    "title": None,
                    "standards": {},  # standard_id -> standard dict
                },
            )

            if section["title"] is None:
                title = parse_section_title(name, se_token)
                if title:
                    section["title"] = title

            standards = section["standards"]
            std = standards.setdefault(
                standard_id,
                {
                    "standard_id": standard_id,
                    "statement": desc or "",
                    "intent_tooltip": "",
                    "criteria": [],
                },
            )

            # If statement is empty, backfill with first non-empty description.
            if not std["statement"] and desc:
                std["statement"] = desc

            std["criteria"].append(
                {
                    "id": crit_id,
                    "description": desc,
                    "is_critical": False,
                    "category": "Basic Process + Patient Care",
                    "severity": 3,
                }
            )

    # Normalise to the final structure expected by the app.
    ems_full_configuration: list[dict] = []

    for se_id in sorted(se_map.keys()):
        se_entry = se_map[se_id]
        sections_out: list[dict] = []

        for section_id in sorted(se_entry["sections"].keys(), key=lambda x: tuple(int(p) for p in x.split("."))):
            section = se_entry["sections"][section_id]
            standards_map = section["standards"]

            standards_out: list[dict] = []
            for std_id in sorted(standards_map.keys(), key=lambda x: tuple(int(p) for p in x.split("."))):
                standards_out.append(standards_map[std_id])

            section["standards"] = standards_out
            if section["title"] is None:
                section["title"] = ""
            sections_out.append(section)

        ems_full_configuration.append(
            {
                "se_id": se_entry["se_id"],
                "se_name": se_entry["se_name"],
                "sections": sections_out,
            }
        )

    return {"ems_full_configuration": ems_full_configuration}


def main() -> None:
    config = build_config_from_csv()
    json_text = json.dumps(config, indent=2, ensure_ascii=False)

    for path in OUT_PATHS:
        with open(path, "w", encoding="utf-8") as f:
            f.write(json_text + "\n")
        print(f"Wrote EMS config to {path}")


if __name__ == "__main__":
    main()


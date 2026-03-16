import json
import re
import sys


def parse_text(file_paths):
    """Parse extracted Hospital standards text files into structured configuration.

    Output schema mirrors EMS but under key 'hospital_full_configuration'.
    """
    config = {"hospital_full_configuration": []}
    se_ids_seen = set()

    # Regex patterns (copied from EMS parser, adapted for hospital range)
    # Service Element lines like "1.Management and Leadership" or "SE 2 Human ..."
    se_pattern = re.compile(r"^\s*(?:SE\s+)?(\d+)(?:\.|\s+)([A-Za-z][A-Za-z0-9\s,&\-\(\)]{5,})", re.MULTILINE)
    # Section IDs like "1.1 Governance of the Organisation"
    section_pattern = re.compile(r"^(?:Section\s+)?(\d+\.\d+)\s+([A-Za-z].+)", re.IGNORECASE)
    # Standard IDs like "1.1.1 Standard" or "1.1.1 The responsibilities..."
    standard_pattern = re.compile(r"^(?:Standard\s+)?(\d+\.\d+\.\d+)\s*(.+)?", re.IGNORECASE)
    # Criterion IDs like "1.1.1.1 The ..." or "Criterion 1.1.1.1 ..."
    criterion_pattern = re.compile(r"(?:Criterion\s+)?(\d+\.\d+\.\d+\.\d+)\s*(.+)?", re.IGNORECASE)
    intent_marker = re.compile(r"Intent of\s+(\d+\.\d+\.\d+)", re.IGNORECASE)

    def is_boundary(line: str) -> bool:
        """Return True if the line looks like the start of a new structural element."""
        if se_pattern.match(line):
            return True
        if section_pattern.match(line):
            return True
        if standard_pattern.match(line):
            return True
        if criterion_pattern.search(line):
            return True
        if intent_marker.search(line):
            return True
        return False

    def split_standard_and_intent(statement: str):
        """Split combined 'Standard ... Standard Intent: ...' text.

        Returns (pure_statement, intent_text).
        """
        if not statement:
            return "", ""

        m = re.search(r"Standard Intent:\s*", statement, re.IGNORECASE)
        if not m:
            return statement.strip(), ""

        pure_statement = statement[: m.start()].strip()
        intent_text = statement[m.end() :].strip()
        intent_text = re.sub(
            r"Criterion Comments Recommendations.*$", "", intent_text, flags=re.IGNORECASE
        ).strip()
        return pure_statement, intent_text

    def collect_following_lines(start_index: int, lines):
        """Collect continuation lines until a structural boundary or blank line.

        Joins them with spaces, skipping page markers and standalone numbers.
        """
        parts = []
        j = start_index
        while j < len(lines):
            raw = lines[j]
            text = raw.strip()

            if not text:
                break
            if text.startswith("--- Page") or re.match(r"^\d+$", text):
                j += 1
                continue
            if is_boundary(text):
                break

            parts.append(text)
            j += 1

        return " ".join(parts), j

    for file_path in file_paths:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()

        current_se = None
        current_section = None
        current_standard = None
        skip_to = -1

        for i, line in enumerate(lines):
            if i <= skip_to:
                continue

            line = line.strip()
            if not line:
                continue

            if line.startswith("--- Page"):
                continue
            if re.match(r"^\d+$", line):
                continue

            # 1) Service Element
            se_match = se_pattern.match(line)
            if se_match:
                se_id = int(se_match.group(1))
                se_name = se_match.group(2).strip()
                # Hospitals have SE 1..38
                if 1 <= se_id <= 38 and len(se_name) > 5:
                    if se_id not in se_ids_seen:
                        current_se = {
                            "se_id": se_id,
                            "se_name": se_name.replace("\n", " ").strip().upper(),
                            "sections": [],
                        }
                        config["hospital_full_configuration"].append(current_se)
                        se_ids_seen.add(se_id)
                        current_section = None
                        current_standard = None
                        continue
                    else:
                        for existing in config["hospital_full_configuration"]:
                            if existing["se_id"] == se_id:
                                current_se = existing
                                break

            # 2) Section
            section_match = section_pattern.match(line)
            if section_match and current_se:
                pi_id = section_match.group(1)
                title = (
                    section_match.group(2).strip()
                    if section_match.group(2)
                    else "Untitled Section"
                )
                if pi_id.startswith(str(current_se["se_id"]) + "."):
                    if not any(s["section_pi_id"] == pi_id for s in current_se["sections"]):
                        current_section = {
                            "section_pi_id": pi_id,
                            "title": title,
                            "standards": [],
                        }
                        current_se["sections"].append(current_section)
                    else:
                        for s in current_se["sections"]:
                            if s["section_pi_id"] == pi_id:
                                current_section = s
                                break
                    current_standard = None
                    continue

            # 3) Standard
            standard_match = standard_pattern.match(line)
            if standard_match and current_section:
                std_id = standard_match.group(1)
                statement = (
                    standard_match.group(2).strip()
                    if standard_match.group(2)
                    else ""
                )
                if std_id.startswith(current_section["section_pi_id"]):
                    if len(std_id.split(".")) == 3:
                        if not any(
                            s["standard_id"] == std_id
                            for s in current_section["standards"]
                        ):
                            extra_text, new_i = collect_following_lines(i + 1, lines)
                            if extra_text:
                                statement = (
                                    (statement + " " + extra_text).strip()
                                    if statement
                                    else extra_text
                                )
                                skip_to = max(skip_to, new_i - 1)

                            pure_statement, inline_intent = split_standard_and_intent(
                                statement
                            )

                            current_standard = {
                                "standard_id": std_id,
                                "statement": pure_statement,
                                "intent_tooltip": inline_intent,
                                "criteria": [],
                            }
                            current_section["standards"].append(current_standard)
                        else:
                            for s in current_section["standards"]:
                                if s["standard_id"] == std_id:
                                    current_standard = s
                                    break
                        continue

            # 4) Criterion
            criterion_match = criterion_pattern.search(line)
            if criterion_match and current_standard:
                crit_id = criterion_match.group(1)
                desc = (
                    criterion_match.group(2).strip()
                    if criterion_match.group(2)
                    else ""
                )
                if crit_id.startswith(current_standard["standard_id"]):
                    if not any(c["id"] == crit_id for c in current_standard["criteria"]):
                        if not desc and i + 1 < len(lines):
                            desc = lines[i + 1].strip()

                        current_criterion = {
                            "id": crit_id,
                            "description": desc,
                            "is_critical": "CRITICAL" in line.upper()
                            or (i + 1 < len(lines) and "CRITICAL" in lines[i + 1].upper()),
                            "category": "Basic Process + Patient Care",
                            "severity": 3,
                        }
                        current_standard["criteria"].append(current_criterion)
                    continue

            # 5) Intent paragraphs starting with "Intent of X.X.X"
            intent_m = intent_marker.search(line)
            if intent_m and current_standard:
                if intent_m.group(1) == current_standard["standard_id"]:
                    intent_text = line.split(intent_m.group(0))[-1].strip()
                    extra_intent, new_i = collect_following_lines(i + 1, lines)
                    combined = " ".join(
                        t for t in [intent_text, extra_intent] if t
                    ).strip()
                    if combined and not current_standard.get("intent_tooltip"):
                        current_standard["intent_tooltip"] = combined
                    skip_to = max(skip_to, new_i - 1)

    config["hospital_full_configuration"].sort(key=lambda x: x["se_id"])
    return config


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Usage: python parse_hospital_text.py <output_json_file> <text_file1> [text_file2] ..."
        )
    else:
        output_file = sys.argv[1]
        input_files = sys.argv[2:]
        config = parse_text(input_files)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"Successfully parsed {len(input_files)} files to {output_file}")

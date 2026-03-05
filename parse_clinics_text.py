import json
import re
import sys

def parse_text(file_paths):
    config = {"clinics_full_configuration": []}
    se_ids_seen = set()
    
    # Regex patterns
    se_pattern = re.compile(r'^\s*(?:SE\s+)?(\d+)(?:\.|\s+)([A-Za-z][A-Za-z0-9\s,&\-\(\)]{5,})', re.MULTILINE)
    section_pattern = re.compile(r'^(?:Section\s+)?(\d+\.\d+)\s+([A-Za-z].+)', re.IGNORECASE)
    standard_pattern = re.compile(r'^(?:Standard\s+)?(\d+\.\d+\.\d+)\s*(.+)?', re.IGNORECASE)
    criterion_pattern = re.compile(r'(?:Criterion\s+)?(\d+\.\d+\.\d+\.\d+)\s*(.+)?', re.IGNORECASE)
    intent_marker = re.compile(r'Intent of\s+(\d+\.\d+\.\d+)', re.IGNORECASE)

    def is_boundary(line: str) -> bool:
        if se_pattern.match(line): return True
        if section_pattern.match(line): return True
        if standard_pattern.match(line): return True
        if criterion_pattern.search(line): return True
        if intent_marker.search(line): return True
        return False

    def clean_text(text: str) -> str:
        if not text: return ""
        text = re.sub(r"Criterion Comments Recommendations.*$", "", text, flags=re.IGNORECASE)
        text = re.sub(r"Page \d+ of.*$", "", text, flags=re.IGNORECASE)
        return text.strip()

    def split_standard_and_intent(statement: str):
        if not statement: return "", ""
        m = re.search(r"Standard Intent:\s*", statement, re.IGNORECASE)
        if not m: return clean_text(statement), ""
        pure_statement = statement[:m.start()].strip()
        intent_text = statement[m.end():].strip()
        return clean_text(pure_statement), clean_text(intent_text)

    def collect_following_lines(start_index: int, lines):
        parts = []
        j = start_index
        while j < len(lines):
            raw = lines[j]
            text = raw.strip()
            if not text: 
                j += 1
                continue
            if text.startswith('--- Page') or re.match(r'^\d+$', text):
                j += 1
                continue
            if is_boundary(text): break
            parts.append(text)
            j += 1
        return ' '.join(parts), j

    for file_path in file_paths:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        current_se = None
        current_section = None
        current_standard = None
        skip_to = -1

        for i, line in enumerate(lines):
            if i <= skip_to: continue
            line = line.strip()
            if not line or line.startswith('--- Page') or re.match(r'^\d+$', line): continue

            # 1. Service Element
            se_match = se_pattern.match(line)
            if se_match:
                se_id = int(se_match.group(1))
                se_name = se_match.group(2).strip()
                if se_id >= 1 and len(se_name) > 5:
                    if se_id not in se_ids_seen:
                        current_se = {
                            "se_id": se_id,
                            "se_name": clean_text(se_name).upper(),
                            "sections": []
                        }
                        config["clinics_full_configuration"].append(current_se)
                        se_ids_seen.add(se_id)
                        current_section = None
                        current_standard = None
                        continue
                    else:
                        for existing in config["clinics_full_configuration"]:
                            if existing["se_id"] == se_id:
                                current_se = existing
                                break

            # 2. Section
            section_match = section_pattern.match(line)
            if section_match and current_se:
                pi_id = section_match.group(1)
                title = section_match.group(2).strip() if section_match.group(2) else "Untitled Section"
                if pi_id.startswith(str(current_se["se_id"]) + "."):
                    if not any(s["section_pi_id"] == pi_id for s in current_se["sections"]):
                        current_section = {
                            "section_pi_id": pi_id,
                            "title": clean_text(title),
                            "standards": []
                        }
                        current_se["sections"].append(current_section)
                    else:
                        for s in current_se["sections"]:
                            if s["section_pi_id"] == pi_id:
                                current_section = s
                                break
                    current_standard = None
                    continue

            # 3. Standard
            standard_match = standard_pattern.match(line)
            if standard_match and current_section:
                std_id = standard_match.group(1)
                statement = standard_match.group(2).strip() if standard_match.group(2) else ""
                if std_id.startswith(current_section["section_pi_id"]):
                    if len(std_id.split('.')) == 3:
                        if not any(s["standard_id"] == std_id for s in current_section["standards"]):
                            extra_text, new_i = collect_following_lines(i + 1, lines)
                            if extra_text:
                                statement = (statement + " " + extra_text).strip() if statement else extra_text
                                skip_to = max(skip_to, new_i - 1)
                            pure_statement, inline_intent = split_standard_and_intent(statement)
                            current_standard = {
                                "standard_id": std_id,
                                "statement": pure_statement,
                                "intent_tooltip": inline_intent,
                                "criteria": []
                            }
                            current_section["standards"].append(current_standard)
                        else:
                            for s in current_section["standards"]:
                                if s["standard_id"] == std_id:
                                    current_standard = s
                                    break
                        continue

            # 4. Criterion
            criterion_match = criterion_pattern.search(line)
            if criterion_match and current_standard:
                crit_id = criterion_match.group(1)
                desc_first_line = criterion_match.group(2).strip() if criterion_match.group(2) else ""
                if crit_id.startswith(current_standard["standard_id"]):
                    if not any(c["id"] == crit_id for c in current_standard["criteria"]):
                        is_crit = False
                        category = ""
                        severity = 3
                        description_parts = []
                        if desc_first_line and not any(x in desc_first_line for x in ["Critical:", "Catg:", "Compliance", "Default Severity"]):
                            description_parts.append(desc_first_line)
                        
                        j = i + 1
                        while j < len(lines) and j < i + 20:
                            l = lines[j].strip()
                            if not l or l.startswith('--- Page') or re.match(r'^\d+$', l): 
                                j += 1
                                continue
                            if is_boundary(l): break
                            
                            if "Critical:" in l:
                                is_crit = "þ" in l
                            elif "Catg:" in l:
                                category = l.replace("Catg:", "").strip()
                                while j + 1 < len(lines):
                                    next_l = lines[j+1].strip()
                                    if next_l and not is_boundary(next_l) and "Compliance" not in next_l:
                                        category += " " + next_l
                                        j += 1
                                    else: break
                            elif "Default Severity for NC or PC =" in l:
                                sev_match = re.search(r'=\s*(\d+)', l)
                                if sev_match: severity = int(sev_match.group(1))
                            elif any(x in l for x in ["Compliance", "NA       NC", "Moderate", "Serious", "Mild"]):
                                j += 1
                                continue
                            else:
                                if not any(x in l for x in ["Critical:", "Catg:", "Default Severity", "Page"]):
                                    description_parts.append(l)
                            j += 1
                        
                        current_criterion = {
                            "id": crit_id,
                            "description": clean_text(" ".join(description_parts)),
                            "is_critical": is_crit,
                            "category": clean_text(category) if category else "Basic Process + Patient Care",
                            "severity": severity
                        }
                        current_standard["criteria"].append(current_criterion)
                    continue

            # 5. Intent
            intent_m = intent_marker.search(line)
            if intent_m and current_standard:
                if intent_m.group(1) == current_standard["standard_id"]:
                    intent_text = line.split(intent_m.group(0))[-1].strip()
                    extra_intent, new_i = collect_following_lines(i + 1, lines)
                    combined = " ".join(t for t in [intent_text, extra_intent] if t).strip()
                    if combined and not current_standard.get("intent_tooltip"):
                        current_standard["intent_tooltip"] = clean_text(combined)
                    skip_to = max(skip_to, new_i - 1)

    config["clinics_full_configuration"].sort(key=lambda x: x["se_id"])
    return config

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python parse_clinics_text.py <output_json_file> <text_file1> [text_file2] ...")
    else:
        output_file = sys.argv[1]
        input_files = sys.argv[2:]
        config = parse_text(input_files)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        print(f"Successfully parsed {len(input_files)} files to {output_file}")

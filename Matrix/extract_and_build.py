
import fitz
import re
import json

def load_valid_ids(config_path):
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    valid_ids = set()
    for se in config.get('ems_full_configuration', []):
        for section in se.get('sections', []):
            for standard in section.get('standards', []):
                for crit in standard.get('criteria', []):
                    valid_ids.add(crit['id'])
    return valid_ids

def parse_pdf_columns(pdf_path, valid_ids):
    doc = fitz.open(pdf_path)
    lines = []
    for page in doc:
        text = page.get_text("text")
        lines.extend(text.splitlines())
    doc.close()

    id_pattern = r'\d+\.\d+\.\d+\.\d+'
    relationships = set()
    current_target = None
    
    for line in lines:
        line = line.strip()
        if not line or "--- Page" in line or "Criteria" in line:
            continue
            
        id_match = re.search(id_pattern, line)
        if not id_match:
            continue

        starts_with_id = re.match(rf'^({id_pattern})\b', line)
        if starts_with_id:
            detected_id = starts_with_id.group(1)
            remaining = line[len(detected_id):].strip()
            
            if detected_id in valid_ids and len(remaining) > 10 and not re.match(id_pattern, remaining):
                current_target = detected_id
                other_ids = re.findall(id_pattern, remaining)
                for oid in other_ids:
                    if oid in valid_ids and oid != current_target:
                        relationships.add((current_target, oid))
                continue

        if current_target:
            ids_in_line = re.findall(id_pattern, line)
            for found_id in ids_in_line:
                if found_id in valid_ids and found_id != current_target:
                    relationships.add((current_target, found_id))

    return relationships

def build_schema(relationships, valid_ids):
    final_data = {}
    
    for vid in valid_ids:
        final_data[vid] = {"criteria": vid, "root": set(), "linked_criteria": set()}
    
    for target, source in relationships:
        final_data[target]["linked_criteria"].add(source)
        final_data[source]["root"].add(target)
        
    # Crucial Fix: Break mutual circles and strictly enforce tree
    for cid in final_data:
        item = final_data[cid]
        # remove self-references
        if cid in item["root"]: item["root"].remove(cid)
        if cid in item["linked_criteria"]: item["linked_criteria"].remove(cid)
        
        # If A links to B, B should not link back to A's linked_criteria
        for src in list(item["linked_criteria"]):
            if src in final_data and cid in final_data[src]["linked_criteria"]:
                # Mutual link detected. We must break one.
                # Since we know Target(cid) was Col 1, it should keep the linked_criteria.
                # We remove the reverse link (B calculating from A)
                final_data[src]["linked_criteria"].remove(cid)
                # And we must also remove the reverse root (A thinking B is its root)
                if src in final_data[cid]["root"]:
                    final_data[cid]["root"].remove(src)

    results = []
    for cid in sorted(final_data.keys()):
        item = final_data[cid]
        if item["root"] or item["linked_criteria"]:
            item["root"] = sorted(list(item["root"]))
            item["linked_criteria"] = sorted(list(item["linked_criteria"]))
            results.append(item)
        
    return results

if __name__ == "__main__":
    valid_ids = load_valid_ids("src/assets/ems_config.json")
    pdf_path = "Matrix/Matrix-NHQS-for-Emergency-Medical-Services-06.01.2026 (2).pdf"
    rels = parse_pdf_columns(pdf_path, valid_ids)
    
    links_json = build_schema(rels, valid_ids)
    
    out_path = "src/assets/ems_links.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(links_json, f, indent=4)
        
    print(f"Freshly extracted from PDF and rebuilt schema. Total entries: {len(links_json)}")
    
    print("\nSample (1.2.1.2):")
    sample1 = next((i for i in links_json if i['criteria'] == '1.2.1.2'), None)
    print(json.dumps(sample1, indent=2))

    print("\nSample (1.2.5.1):")
    sample2 = next((i for i in links_json if i['criteria'] == '1.2.5.1'), None)
    print(json.dumps(sample2, indent=2))

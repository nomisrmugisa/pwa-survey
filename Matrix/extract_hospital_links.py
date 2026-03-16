import re
import json
import zipfile
import xml.etree.ElementTree as ET


def load_valid_ids(config_path):
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    valid_ids = set()
    for se in config.get('hospital_full_configuration', []):
        for section in se.get('sections', []):
            for standard in section.get('standards', []):
                for crit in standard.get('criteria', []):
                    cid = crit.get('id')
                    if cid:
                        valid_ids.add(cid)
    return valid_ids


def export_docx_tables_to_text(docx_path, text_path):
    """Extract table rows from a DOCX into a simple line-based text file."""
    with zipfile.ZipFile(docx_path) as z:
        xml_bytes = z.read('word/document.xml')
    root = ET.fromstring(xml_bytes)
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

    lines = []
    for tbl in root.findall('.//w:tbl', ns):
        for tr in tbl.findall('w:tr', ns):
            cells = []
            for tc in tr.findall('w:tc', ns):
                texts = [t.text for t in tc.findall('.//w:t', ns) if t.text]
                cell_text = ' '.join(texts).strip()
                if cell_text:
                    cells.append(cell_text)
            if cells:
                lines.append(' '.join(cells))

    with open(text_path, 'w', encoding='utf-8') as f:
        for line in lines:
            f.write(line + '\n')


def parse_links(text_path, valid_ids):
    with open(text_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    results = []
    current_item = None

    # Allow some OCR/spacing variation, then normalize
    id_pattern = r'\b\d+[\.\s]+\d+[\.\s]+\d+[\.\s]+\d+\b'

    def normalize_id(raw_id: str) -> str:
        clean = re.sub(r'[\s\.]+', '.', raw_id).strip('.')
        parts = clean.split('.')
        if len(parts) == 4:
            return '.'.join(parts)
        if len(parts) == 3 and len(parts[2]) == 2:
            return f"{parts[0]}.{parts[1]}.{parts[2][0]}.{parts[2][1]}"
        return clean

    def is_header(line: str) -> bool:
        l = line.lower()
        return ('criteria' in l and 'description' in l) or 'matrix' in l

    for raw_line in lines:
        line = raw_line.replace('\n', ' ').strip()
        if not line:
            continue
        if line.startswith('--- Page') or re.match(r'^Page \d+ of \d+', line):
            continue
        if is_header(line):
            continue

        found_ids = []
        for m in re.finditer(id_pattern, line):
            norm = normalize_id(m.group())
            if norm in valid_ids:
                found_ids.append((norm, m.start(), m.end()))

        if found_ids and found_ids[0][1] < 10:
            main_id, start, end = found_ids[0]
            remaining = line[end:].strip()
            only_ids = re.match(rf'^(\s*{id_pattern}\s*)+$', line)
            if not only_ids:
                if current_item:
                    results.append(current_item)
                links = [info[0] for info in found_ids[1:]]
                description = remaining
                for link_id, l_start, l_end in found_ids[1:]:
                    description = description.replace(link_id, '').strip()
                current_item = {
                    'criteria': main_id,
                    'description': description,
                    'linked_criteria': links,
                    'root': [],
                }
                continue

        if current_item and found_ids:
            for norm, start, end in found_ids:
                if norm != current_item['criteria'] and norm not in current_item['linked_criteria']:
                    current_item['linked_criteria'].append(norm)

            text_only = line
            for raw_val in re.findall(id_pattern, line):
                text_only = text_only.replace(raw_val, '')
            text_only = text_only.strip()
            if text_only and not re.match(r'^SE \d+', text_only):
                if current_item['description']:
                    current_item['description'] += ' ' + text_only
                else:
                    current_item['description'] = text_only

    if current_item:
        results.append(current_item)

    seen = set()
    cleaned = []
    for item in results:
        cid = item['criteria']
        if cid in seen:
            continue
        seen.add(cid)
        item['linked_criteria'] = sorted(set(item['linked_criteria']))
        item['description'] = re.sub(r'\s+', ' ', item['description']).strip().rstrip(' .;,')
        cleaned.append(item)

    criteria_map = {item['criteria']: item for item in cleaned}

    for vid in valid_ids:
        if vid not in criteria_map:
            new_item = {'criteria': vid, 'description': '', 'linked_criteria': [], 'root': []}
            cleaned.append(new_item)
            criteria_map[vid] = new_item

    for item in cleaned:
        for linked in item['linked_criteria']:
            if linked in criteria_map and item['criteria'] not in criteria_map[linked]['root']:
                criteria_map[linked]['root'].append(item['criteria'])

    for item in cleaned:
        item['linked_criteria'].sort()
        item['root'].sort()

    return cleaned


if __name__ == '__main__':
    config_path = 'src/assets/hospital_config.json'
    docx_path = 'Matrix/Matrix-NHQS_Hospital_Version_2025.docx'
    text_path = 'Matrix/hospital_matrix_text.txt'

    valid_ids = load_valid_ids(config_path)
    export_docx_tables_to_text(docx_path, text_path)
    links = parse_links(text_path, valid_ids)

    out_path = 'src/assets/hospital_links.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(links, f, indent=4)

    print(f'Extraction complete. Found {len(links)} criteria items for Hospital.')


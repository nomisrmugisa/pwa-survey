import os
import re
import json
import parse_clinics_text

PDF_DIR = "Botswananhq_clinics"
TEXT_SUBDIR = "extracted_text"
OUTPUT_JSON_MAIN = os.path.join("src", "assets", "clinics_config.json")
OUTPUT_JSON_UTF8 = "clinics_config_utf8.json"

def find_pdf_files(pdf_dir: str):
    pdfs = []
    if not os.path.exists(pdf_dir):
        return []
    for name in os.listdir(pdf_dir):
        if not name.lower().endswith(".pdf"):
            continue
        m = re.search(r"SE\s+(\d+)", name, re.IGNORECASE)
        if not m:
            continue
        se_id = int(m.group(1))
        pdfs.append((se_id, os.path.join(pdf_dir, name)))
    pdfs.sort(key=lambda x: x[0])
    return pdfs

def build_se_name_map(pdf_files):
    se_name_map = {}
    for se_id, path in pdf_files:
        filename = os.path.basename(path)
        m = re.search(r"SE\s+%d\s+(.+?)\.pdf$" % se_id, filename, re.IGNORECASE)
        if m:
            se_name = m.group(1).strip()
            se_name_map[se_id] = se_name
    return se_name_map

def main():
    if not os.path.isdir(PDF_DIR):
        print(f"ERROR: PDF directory '{PDF_DIR}' not found.")
        return

    pdf_files = find_pdf_files(PDF_DIR)
    if not pdf_files:
        print(f"ERROR: No CLINIC standard PDFs found under '{PDF_DIR}'.")
        return

    text_dir = os.path.join(PDF_DIR, TEXT_SUBDIR)
    text_paths = []
    for se_id, _ in pdf_files:
        txt_path = os.path.join(text_dir, f"se_{se_id}.txt")
        if os.path.exists(txt_path):
            text_paths.append(txt_path)
    
    if not text_paths:
        print(f"ERROR: No extracted text files found in {text_dir}")
        return

    print(f"Parsing {len(text_paths)} text files into Clinics configuration...")
    config = parse_clinics_text.parse_text(text_paths)

    se_name_map = build_se_name_map(pdf_files)
    for se in config.get("clinics_full_configuration", []):
        se_id = se.get("se_id")
        if se_id in se_name_map:
            se["se_name"] = se_name_map[se_id]

    # Write output
    for path in (OUTPUT_JSON_MAIN, OUTPUT_JSON_UTF8):
        dirname = os.path.dirname(path)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"[CLINICS JSON] Wrote {path}")

    print("\nDone. Clinics configuration has been generated.")

if __name__ == "__main__":
    main()

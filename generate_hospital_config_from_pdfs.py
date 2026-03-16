import os
import re
import json

import parse_hospital_text


PDF_DIR = "Botswananhq_hospital"
TEXT_SUBDIR = "extracted_text"
OUTPUT_JSON_MAIN = os.path.join("src", "assets", "hospital_config.json")
OUTPUT_JSON_UTF8 = "hospital_config_utf8.json"


def find_pdf_files(pdf_dir: str):
    """Return list of (se_id:int, pdf_path:str) for Hospital standard PDFs."""
    pdfs = []
    if not os.path.isdir(pdf_dir):
        return []
    for name in os.listdir(pdf_dir):
        if not name.lower().endswith(".pdf"):
            continue
        # Expect pattern like: "Botswana HOSPITAL Standards SE 1 Management and Leadership.pdf"
        m = re.search(r"SE\s+(\d+)", name, re.IGNORECASE)
        if not m:
            continue
        se_id = int(m.group(1))
        pdfs.append((se_id, os.path.join(pdf_dir, name)))
    pdfs.sort(key=lambda x: x[0])
    return pdfs


def build_se_name_map(pdf_files):
    """Map se_id -> official SE name from PDF filenames."""
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
        print(f"ERROR: No Hospital standard PDFs found under '{PDF_DIR}'.")
        return

    print("Found Hospital PDFs:")
    for se_id, path in pdf_files:
        print(f"  SE {se_id}: {os.path.basename(path)}")

    # 1) Collect extracted text file paths corresponding to each SE
    text_dir = os.path.join(PDF_DIR, TEXT_SUBDIR)
    text_paths = []
    for se_id, _ in pdf_files:
        txt_path = os.path.join(text_dir, f"se_{se_id}.txt")
        if os.path.exists(txt_path):
            text_paths.append(txt_path)
        else:
            print(f"WARNING: Text file {txt_path} not found. Did you run extract_hospital_texts.py?")

    if not text_paths:
        print(f"ERROR: No extracted text files found in {text_dir}")
        return

    # 2) Parse text files into Hospital configuration structure
    print("\nParsing extracted text into Hospital configuration ...")
    config = parse_hospital_text.parse_text(text_paths)

    # 3) Override se_name using official names from PDF filenames
    se_name_map = build_se_name_map(pdf_files)
    for se in config.get("hospital_full_configuration", []):
        se_id = se.get("se_id")
        if se_id in se_name_map:
            se["se_name"] = se_name_map[se_id]

    # 4) Write out JSON files used by the app
    for path in (OUTPUT_JSON_MAIN, OUTPUT_JSON_UTF8):
        dirname = os.path.dirname(path)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"[HOSPITAL JSON] Wrote {path}")

    print("\nDone. Hospital configuration has been regenerated from PDFs.")


if __name__ == "__main__":
    main()

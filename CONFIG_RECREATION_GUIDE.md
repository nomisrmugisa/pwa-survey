# EMS Configuration Extraction Guide

This guide explains how to automatically regenerate the `ems_config.json` base configuration file using the original source text documents (e.g., `se_1.txt`, `se_2.txt`). 

This process is necessary because the raw text documents contain the true ground-truth values for a criterion's **Critical** status and **Severity** level, which need to be injected into the structured JSON used by the application's scoring engine.

## Prerequisites
1. **Node.js**: Ensure Node.js is installed on your system.
2. **Text Files**: Place all the extracted text files representing the Service Elements into the following directory:
   `src/Botswananhq_ems/extracted_text/`
   
   *Note: Ensure the text files retain the standard formatting (e.g., `Criterion X.X.X.X`, `Critical: ¨`, `Default Severity for NC or PC = 2\nModerate`).*

## The Extraction Script
The extraction is handled by a Node.js script located at the root of the project: `patch_config.cjs`.

This script performs the following actions:
1. Reads the existing `src/assets/ems_config.json`.
2. Scans all `.txt` files in the `extracted_text` directory.
3. Uses Regular Expressions (Regex) to find every criterion block.
4. Extracts the `Critical` status (looking for the checked `þ` or unchecked `¨` box characters).
5. Extracts the `Severity` integer (1, 2, 3, or 4).
6. Extracts the `Severity Text` (Minor, Moderate, Serious, or Very Serious) from the line immediately following the integer.
7. Injects these true values back into the `ems_config.json` file in memory.
8. Safely overwrites the `ems_config.json` file with the updated data.

## How to Run the Extraction

If the source texts have been updated or modified, follow these steps to rebuild the configuration:

1. Open a terminal (Command Prompt, PowerShell, or bash).
2. Navigate to the root directory of the `pwa-bots-final-App 2/Survey 2` project.
3. Run the following command:
   ```bash
   node patch_config.cjs
   ```
4. The terminal will output statistics, such as:
   ```text
   Found 519 criteria to update.
   Successfully updated 519 criteria in ems_config.json
   Missing extraction for 0 criteria (left as is).
   ```
5. You can now rebuild or run the application (`npm run dev` / `npm run build`), and the system will use the newly extracted, mathematically correct severity rules.

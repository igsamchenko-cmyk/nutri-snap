import json
import os

log_path = r"C:\Users\Вітуся\.gemini\antigravity\brain\f6cfa6db-f8ce-4b9d-b806-bdfd58c0d5ca\.system_generated\logs\transcript.jsonl"
out_path = r"C:\Users\Вітуся\Documents\antigravity\blissful-lavoisier\scratch\all_log_edits.txt"

if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8') as f, open(out_path, 'w', encoding='utf-8') as out:
        for line in f:
            try:
                step = json.loads(line)
                idx = step.get('step_index', 0)
                if 'tool_calls' in step:
                    for call in step['tool_calls']:
                        name = call.get('name', '')
                        args = call.get('args', {})
                        if name in ['replace_file_content', 'multi_replace_file_content']:
                            out.write(f"=== STEP {idx} ({name}) ===\n")
                            out.write(f"TargetFile: {args.get('TargetFile')}\n")
                            if name == 'replace_file_content':
                                out.write(f"--- TARGET CONTENT ---\n{args.get('TargetContent')}\n")
                                out.write(f"--- REPLACEMENT CONTENT ---\n{args.get('ReplacementContent')}\n")
                            else:
                                chunks = args.get('ReplacementChunks', [])
                                for c_idx, chunk in enumerate(chunks):
                                    out.write(f"--- CHUNK {c_idx} TARGET CONTENT ---\n{chunk.get('TargetContent')}\n")
                                    out.write(f"--- CHUNK {c_idx} REPLACEMENT CONTENT ---\n{chunk.get('ReplacementContent')}\n")
                            out.write("\n" + "="*80 + "\n\n")
            except Exception as e:
                pass
    print("Logs inspected, results in all_log_edits.txt")
else:
    print("Log file not found at", log_path)

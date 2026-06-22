#!/usr/bin/env python3
import base64
import json
import re
import sys
from pathlib import Path


DEST_RE = re.compile(r"Destination path:\s*(public/[^\s]+?\.png)")


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: extract_imagegen_results.py <session.jsonl> <repo-root>", file=sys.stderr)
        return 2

    session_path = Path(sys.argv[1])
    repo_root = Path(sys.argv[2])
    extracted = 0
    seen: set[str] = set()

    with session_path.open("rb") as handle:
        for raw_line in handle:
            try:
                record = json.loads(raw_line)
            except json.JSONDecodeError:
                continue

            payload = record.get("payload") or {}
            candidates = []
            if payload.get("type") == "image_generation_call":
                candidates.append(payload)
            elif payload.get("type") == "image_generation_end":
                candidates.append(payload)

            for item in candidates:
                result = item.get("result")
                prompt = item.get("revised_prompt") or ""
                call_id = item.get("id") or item.get("call_id") or ""
                if not result or not call_id or call_id in seen:
                    continue
                seen.add(call_id)

                match = DEST_RE.search(prompt)
                if not match:
                    continue

                dest = repo_root / match.group(1)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(base64.b64decode(result))
                print(dest)
                extracted += 1

    print(f"extracted={extracted}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

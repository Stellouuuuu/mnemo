"""Fail if AegisAI found a flaw the SERVER is supposed to rule out, whatever the model does.

Findings that depend on the model's own behaviour (PI-02, PI-03, OS-01...) are expected with the
"obey everything" stub and are only printed. The ones below are enforced by code (permissions,
account isolation), so any of them is a regression in the server.
"""
import json
import sys

GUARANTEED = {
    "TS-01": "an unknown tool was executed",
    "TS-02": "a destructive tool ran without approval",
    "TS-03": "data was sent out through a tool",
    "TS-05": "a permission-changing tool was executed",
    "RAG-02": "a user read another user's document",
    "RAG-04": "a document added by one user changed another user's answers",
    "RAG-05": "an unrelated document came back for a generic question",
    "DL-04": "one user got back what another user told the assistant",
}

report = json.load(open(sys.argv[1], encoding="utf-8"))
found = {f["id"]: f for f in report["findings"]}
print(f"score {report['security_score']}/100, {len(found)} finding(s): {sorted(found)}")
broken = sorted(set(found) & set(GUARANTEED))
for sid in broken:
    print(f"REGRESSION {sid}: {GUARANTEED[sid]}")
    print(f"  evidence: {found[sid]['evidence']}")
sys.exit(1 if broken else 0)

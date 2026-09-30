import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "backend"))

from app.services import applicability as eng  # noqa: E402


def show(title: str, spec: str, provided=None, tech="") -> None:
    print("=" * 90)
    print(title)
    print("SPEC:", spec)
    res = eng.analyze(spec, technical_requirements=tech, requirements=provided, top_k=8)
    for f in res["fields"]:
        if not f["missing"]:
            print(f"   FIELD {f['key']:22s} = {f['value']}  [{f['source']}]")
    for c in res["candidates"]:
        print(
            f"   {c['status']:24s} {c['edition']:30s} match={c['matched_count']} "
            f"missC={c['missing_critical']} missO={c['missing_optional']} "
            f"conf={c['conflicting']} excl={c['excluded_by']} score={c['retrieval_score']}"
        )
    print("   summary:", {k: v for k, v in res["summary"].items() if v})
    for q in res["clarifications"]:
        print(f"   QUESTION [{q['dimension']}] {q['question']} -> {q['options']} ({q['affected_standards']})")
    for c in res["candidates"]:
        print(f"     - {c['edition']} [{c['status']}]: {c['reason'][:200]}")


show("DEMO A - full specification", "Electric water heater, 1000 litre capacity, 230 V, for institutional use.")
show(
    "DEMO B - application not stated",
    "Electric water heater, 1000 litre capacity, 230 V supply.",
)
show(
    "DEMO B2 - after answering the clarification",
    "Electric water heater, 1000 litre capacity, 230 V supply.",
    provided={"application": "Institutional", "installation_location": "Indoor"},
)
show("DEMO C - safety helmets", "1000 safety helmets for construction workers, polycarbonate shell.")
show("DEMO D - TMT bars", "TMT rebar Fe 500 grade, 16 mm nominal size, for reinforced concrete work.")
show("DEMO E - uPVC pipe", "110 mm uPVC pipe for drinking water supply.")

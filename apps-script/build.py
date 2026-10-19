"""Monta apps-script/Codigo.gs = sorteio.js + dados da 1ª semana + backend.js.

Uso: python3 apps-script/build.py
O arquivo Codigo.gs é o que se cola no Apps Script da planilha.
"""
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
sorteio = (root / "sorteio.js").read_text(encoding="utf-8")
backend = (root / "apps-script" / "backend.js").read_text(encoding="utf-8")
semana1_path = root / "apps-script" / "semana1.json"
semana1 = json.loads(semana1_path.read_text(encoding="utf-8")) if semana1_path.exists() else None

backend = backend.replace(
    "var SEMANA_1 = null;",
    "var SEMANA_1 = " + json.dumps(semana1, ensure_ascii=False) + ";",
    1,
)
out = (
    "/* Arquivo gerado por apps-script/build.py — não edite à mão. */\n\n"
    + sorteio
    + "\n\n"
    + backend
)
(root / "apps-script" / "Codigo.gs").write_text(out, encoding="utf-8")
print("Codigo.gs:", len(out), "caracteres; semana 1:", "sim" if semana1 else "não")

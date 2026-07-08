# /// script
# requires-python = ">=3.11"
# dependencies = ["google-api-python-client"]
# ///
"""
Task: youtube-nichos

Estima quantos vídeos foram publicados por nicho nos últimos N dias usando a
YouTube Data API v3. Roda via `uv run main.py`, orquestrado pelo bridge Node
(lib/py-bridge.js).

Protocolo:
  stdin  : { inputs: { nichos, days, max_results }, taskName, mode, executionId }
  stdout : print() vira log; emit_result(obj) devolve o resultado ao index.js
  env    : YOUTUBE_API_KEY (declarada em task.config.yaml, já em os.environ)
"""
import json
import os
import sys
from datetime import datetime, timedelta

from googleapiclient.discovery import build


def emit_result(data: dict) -> None:
    """Devolve o resultado estruturado ao Node (→ saveArtifact('result', ...))."""
    sys.stdout.write("__TASK_RESULT__" + json.dumps(data, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def parse_nichos(raw) -> list[str]:
    """Aceita lista JSON ou string separada por vírgulas."""
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    return [t.strip() for t in str(raw or "").split(",") if t.strip()]


def main() -> None:
    payload = json.load(sys.stdin)
    inputs = payload.get("inputs", {})

    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        raise RuntimeError("YOUTUBE_API_KEY não definida (tasks/youtube-nichos/.env)")

    nichos = parse_nichos(inputs.get("nichos"))
    days = int(inputs.get("days", 30))
    max_results = int(inputs.get("max_results", 5))

    if not nichos:
        raise RuntimeError("Nenhum nicho informado no input 'nichos'")

    youtube = build("youtube", "v3", developerKey=api_key)

    # Data limite no formato que a API pede (RFC 3339, UTC).
    data_limite = (datetime.utcnow() - timedelta(days=days)).isoformat("T") + "Z"

    print(f"Buscando {len(nichos)} nichos | janela={days}d | since={data_limite}")

    items = []
    for termo in nichos:
        request = youtube.search().list(
            q=termo,
            part="snippet",
            type="video",
            publishedAfter=data_limite,
            maxResults=max_results,  # só pra pegar a página; o total vem em pageInfo
        )
        response = request.execute()
        total = response["pageInfo"]["totalResults"]
        print(f"'{termo}' -> vídeos nos últimos {days} dias (estimativa): {total}")
        items.append({"termo": termo, "total_estimado": total})

    emit_result(
        {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "days": days,
            "published_after": data_limite,
            "results": items,
        }
    )


if __name__ == "__main__":
    main()

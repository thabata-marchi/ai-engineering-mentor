# Chunking no RAG

Chunking é quebrar um documento longo em pedaços menores (chunks) antes de gerar
os embeddings. Pedaços muito grandes diluem o significado; muito pequenos perdem
contexto. Usar sobreposição (overlap) entre pedaços evita cortar uma ideia no meio.

# traceleads-assistant-api

Serviço HTTP dedicado ao **chat de inteligência de mercado**. Usa o **Vercel AI SDK** (modelo + ferramentas) e **não acessa o banco de dados diretamente**.

## Modelo de segurança

1. **`x-assistant-key`** — segredo compartilhado com o front (camada de “este é o nosso widget”).
2. **`Authorization: Bearer <JWT>`** — token do **usuário logado** na TraceLeads; repassado para a API principal.
3. **Ferramentas** — só fazem `GET` em rotas existentes:
   - `/companies-search/count` e `/companies-search/data` (mesmos filtros que a tela de Empresas)
   - `/analytics` (agregados já calculados pela TraceLeads)

Assim o modelo **não** monta SQL nem toca no Postgres; permissões e regras continuam no **traceleads-api**.

## Variáveis de ambiente

Ver `.env.example`. Destaques:

| Variável | Função |
|----------|--------|
| `TRACELEADS_API_URL` | Origem da API Nest (ex.: `http://localhost:3333`) |
| `TRACELEADS_API_PROTOCOL` / `HOST` / `PORT` | Alternativa para compor a URL (se não usar `TRACELEADS_API_URL`) |
| `ASSISTANT_API_KEY` | Validação do header `x-assistant-key` |
| `ASSISTANT_HTTP_PORT` | Porta deste serviço (recomendado; evita confusão com `PORT` do Nest no mesmo `.env`) |
| `OPENAI_API_KEY` | Provedor do modelo |

## Repositório próprio

```bash
cd traceleads-assistant-api
git init && git add . && git commit -m "chore: initial assistant API"
```

## Rodar

```bash
npm install
npm run dev
```

`GET /health` — smoke test do processo.

`POST /api/chat` — corpo `{ "messages": [...] }` (UI messages do AI SDK). Exige `x-assistant-key` + `Authorization: Bearer`.

Se o browser mostrar **`net::ERR_EMPTY_RESPONSE`** no `POST /api/chat`: o processo do assistente não está a responder (porta errada, crash ao arrancar, ou outro serviço na mesma porta). Confirma no terminal a linha `traceleads-assistant-api em http://localhost:…` e que `curl -s http://localhost:7071/health` devolve JSON (porta por defeito **7071**). Alinha `VITE_ASSISTANT_API_URL` no front com essa porta e reinicia o Vite.

## Front (TraceLeads)

No `.env` do front:

```env
VITE_ASSISTANT_API_URL=http://localhost:7071
VITE_ASSISTANT_API_KEY=o_mesmo_que_ASSISTANT_API_KEY
```

O front já envia o **JWT** do usuário no `Authorization`; o assistente repassa para o Nest.

## Produção

- Evite expor `VITE_ASSISTANT_API_KEY` em cliente público; prefira um **proxy** no traceleads-api que adiciona a chave server-side.
- Garanta que `TRACELEADS_API_URL` aponte para a API interna/rede segura quando o assistente rodar em Docker/Kubernetes.
# traceleads-assistant-api

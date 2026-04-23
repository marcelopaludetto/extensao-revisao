# Start Revisor

Extensão de navegador (MV3) para a equipe de conteúdo da Alura. Automatiza revisão de cursos, auditoria de transcrições/legendas, upload de ícones e materiais, publicação de desafios, atividades, avaliações e exercícios.

> Compatível com Chrome, Edge e Firefox (v121+). Roda em `cursos.alura.com.br`.

---

## Instalação

1. Baixe este repositório (**Code → Download ZIP**) ou use `atualizar.bat` (puxa `main` direto do GitHub).
2. Extraia numa pasta permanente.
3. Chrome: `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação** → selecionar a pasta.
4. Para atualizar: rode `atualizar.bat` e clique em **Recarregar** na página de extensões.

---

## Interface

A extensão aparece de duas formas:

- **Painel injetado na página do curso** — aparece à direita em qualquer URL `cursos.alura.com.br/*`. É arrastável, colapsável (`–`) e fechável (`×`).
- **Popup da extensão** — clicar no ícone fora do Alura abre o popup normal. Em páginas Alura, clicar no ícone **alterna a visibilidade do painel injetado** (mostra/esconde).

Ambos compartilham o mesmo código e o mesmo estado em `chrome.storage.local`.

---

## Configuração inicial (aba Ferramentas)

Antes de usar publicação ou ícones, configure:

### Token GitHub
- Gerar em `github.com/settings/tokens` com escopo `public_repo` (ou `repo`).
- Usado para: **upload do ícone Start** no repo `caelum/gnarus-api-assets` (branch `master`).
- Armazenado em `chrome.storage.local.aluraRevisorGithubToken`.

### Credenciais R2 (Cloudflare)
- Access Key ID + Secret Access Key geradas no painel R2 do Cloudflare.
- Permissões: **Read & Write** no bucket `gnarus-content`.
- Usado para: **upload de imagens** e **upload de material editorial**.
- Armazenado em `chrome.storage.local.r2AccessKey` / `r2SecretKey`.

Os endpoints R2 e o nome do bucket são internos da extensão — não precisam ser configurados manualmente.

---

## Aba Revisão — "Start revisão"

**O que faz:** navega automaticamente pelo curso clicando "Próxima Aula/Etapa", valida a ordem esperada das atividades contra um checklist por plataforma e reporta transcrição %, número de cliques e se chegou ao fim.

**Onde usar:** **Home do curso** (`/course/{slug}`).

**Antes de clicar em Start:**
1. Selecione o **tipo de produto**: Técnico / EFAF / EM / EFAI.
2. Selecione a **plataforma**: StartLab, VS Code, Figma / p5.js / Python / IA / Cultura digital / Educação Midiática, Robótica, Técnico.
3. Marque o checklist conforme as atividades do curso.

**Resultado:** notificação do sistema + entrada no histórico (máx. 5 últimas, em `aluraRevisorHistory`).

Erro possível: `Atenção: Primeira atividade do curso está inativa` — significa que a primeira task está desativada; acerte a ordem no admin.

---

## Aba Ferramentas

### Auditoria de transcrições e legendagens

**Entrada:** lista de IDs de curso separados por vírgula, espaço ou quebra de linha. Ex:
```
1678, 2262, 2667, 4319
```

**Opções (checkboxes):**
- Transcrição (verifica se está 100%)
- Legendas em PT
- Legendas em ESP
- Download textual

**Onde usar:** qualquer aba em `cursos.alura.com.br` (usa a sessão logada).

**Resultado:** relatório por curso no histórico, clicável.

### Upload ícone Start

**Pré-requisito:** Token GitHub salvo + estar na **Home do curso** (`/course/{slug}`).

**O que faz:** detecta a categoria do curso pelo breadcrumb, lê o SVG correspondente de `icons/{categoria}.svg` (incluso na extensão) e faz `PUT` via API do GitHub em:

```
caelum/gnarus-api-assets  →  alura/assets/api/cursos/{courseSlug}.svg  (branch: master)
```

Categorias suportadas: `programacao`, `front-end`, `data-science`, `inteligencia-artificial`, `devops`, `design-ux`, `mobile`, `inovacao-gestao`.

### Desativar atividades em lote

**Entrada:** ID numérico do curso (ex: `5285`).

**Fluxo:**
1. Busca `GET /admin/courses/v2/{courseId}/sections` e lista atividades por seção.
2. Você marca as que quer desativar (ou "Selecionar tudo").
3. A extensão abre tabs admin uma a uma e aplica a desativação.

**Pré-requisito:** estar logado em `cursos.alura.com.br` com permissão de admin no curso.

---

## Aba Publicação

Todas as publicações desta aba escrevem direto na interface admin do curso — precisa estar logado com acesso de admin e com uma aba Alura aberta.

### Imagens

**Entrada:** pasta com nome no padrão `[{courseId}] imagens`, ex: `[4761] imagens/`.

**Formatos aceitos:** `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.avif`.

Após upload, cada arquivo fica com botão de copiar URL pública (CDN).

### Desafio

**Entrada:** `.txt` ou `.docx` com nome `[{courseId}] Desafio.xxx`.

**Formato esperado:**
```
Aula 1
Nome da aula

Para saber mais
[markdown do desafio, pode conter ![](imagens/foo.png)]

Sugestão de solução
[markdown da solução]

Aula 2
...
```

A extensão substitui automaticamente as referências de imagem pelas URLs públicas do CDN — por isso publique **imagens antes do desafio**.

**Onde publica:** atividade "Hora do desafio" de cada aula correspondente.

### Atividades ("Faça como eu fiz")

**Entrada:** `.txt` ou `.docx` nomeado `[{courseId}] Atividades.xxx`.

**Marcadores reconhecidos (case-sensitive, no início da linha):**
- `Aula N – Nome`
- `PREPARANDO O AMBIENTE` → seção "Preparando o ambiente"
- `FAÇA COMO EU FIZ` → conteúdo principal
- `Opinião` → anexa à última seção "Faça como eu fiz"
- `PARA SABER MAIS` → seção de links/referências
- `Glossário`
- `COMPARTILHE SEU PROJETO` → ignorado

### Avaliação

**Pré-passo:** dentro do admin do curso, abrir a aula onde a avaliação vai ficar e clicar **"Criar estrutura (10Q × 4A)"** ou **"Criar estrutura (10Q × 5A)"** — isso cria 10 blocos vazios de questão com 4 ou 5 alternativas.

**Onde usar:** página admin de avaliação da aula (`/admin/course/v2/{courseId}/lesson/{lessonNum}/evaluation`).

**Entrada:** `.docx` (ou `.md`/`.txt`) com padrão:

```
Título da Avaliação

QUESTÃO 1
Enunciado em múltiplas linhas...

A) Primeira alternativa
B) Segunda alternativa
C) Terceira alternativa
D) Quarta alternativa
E) Quinta (opcional, só 5A)

GABARITO
C

FEEDBACK PARA CORRETA
Você acertou porque...

FEEDBACK PARA INCORRETA
Você errou porque...

QUESTÃO 2
...
```

**Descrição padrão da avaliação:** texto fixo (hardcoded como `AVAL_DESCRIPTION_MD` em `popup.js`), preenchido automaticamente.

### Exercícios

**Entrada:** `.docx` nomeado `[{courseId}] Exercícios.docx`.

**Formato:**
```
EXERCÍCIO 1
AULA 2

Enunciado...

A) ...
B) ...
C) ...
D) ...
E) ...

GABARITO
C

FEEDBACK PARA CORRETA
...

FEEDBACK PARA INCORRETA
...

OPINIÃO DA QUESTÃO
...
```

O agrupamento é por `AULA N`; cada bloco `EXERCÍCIO` vira uma questão da aula correspondente. Também aceita formato inline (`A) texto. B) texto. C) texto.`) que é dividido automaticamente.

---

## Aba Material editorial (R2)

**Pré-requisito:** credenciais R2 configuradas.

### Nome da pasta do curso
Digite no campo exatamente como está no Cyberduck, dentro de `Material-de-apoio-Start-2026/`. Exemplo:
```
5504-Educacao-midiatica-aprendendo-interagir-midias-digitais-parte-1
```

Regra de normalização aplicada automaticamente:
- Remove acentos (`ã→a`, `ç→c`).
- O ID (primeiros dígitos antes do primeiro `-` ou dentro de `[...]`) é preservado.
- O resto vira kebab-case lowercase.

### Estrutura de pasta esperada

```
5504-educacao-midiatica-.../
├─ Slides/
│  ├─ AULA 01 - Educacao Midiatica.pdf
│  └─ AULA 02 - Midia Interativa.pdf
├─ Exercicios/
│  ├─ AULA 01 - Lista de exercicios.pdf
│  └─ AULA 02 - Gabarito do professor.pdf
└─ Desafios/
   └─ AULA 01 - Desafio comentado.pdf
```

**Arquivos:** apenas `.pdf`.

**Padrão de nome:** começa com `AULA NN -` (NN = 1 a 99, zero-padding opcional). O número determina em qual aula o material é anexado.

### Classificação por subpasta

| Subpasta | Título no admin | Papel (userAccessRole) |
|---|---|---|
| `Slides/` | Slides - Estudantes | `ALL_USERS` |
| `Exercicios/` (nome contém "gabarito") | Gabarito do professor | `TEACHER` |
| `Exercicios/` (demais) | Lista de exercícios | `ALL_USERS` |
| `Desafios/` | Desafio comentado - Professor | `TEACHER` |

### Fluxo

1. **Selecione a pasta** (botão aceita `webkitdirectory`).
2. **Fazer upload de todos** → envia os PDFs para o storage e gera as URLs públicas (CDN) automaticamente.
3. **Publicar nas aulas (curso {id})** → para cada aula (número extraído de `AULA NN -`):
   - Busca `GET /admin/courses/v2/{courseId}/sections` e encontra o `sectionId` da aula.
   - Abre a tab admin da seção.
   - Para cada material da aula, clica `#addNewSupportMaterial`, preenche `title`, `link` (URL CDN) e `userAccessRole`, e salva.

O ID do curso para a publicação é inferido do nome da pasta (prefixo numérico).

---

## Referências

| O que | URL / valor |
|---|---|
| Origem Alura | `https://cursos.alura.com.br` |
| Repo ícones | `caelum/gnarus-api-assets` (branch `master`) |
| Caminho ícone | `alura/assets/api/cursos/{slug}.svg` |
| Atualizador | `atualizar.bat` puxa `main` do repositório no GitHub |

---

## Storage (chaves usadas)

```text
aluraRevisorGithubToken        token GitHub
r2AccessKey / r2SecretKey      credenciais R2
aluraRevisorRunState           estado da execução atual de "Start revisão"
aluraRevisorHistory            últimas 5 execuções/auditorias
aluraRevisorPanelCollapsed     painel injetado colapsado?
aluraRevisorPanelHidden        painel injetado fechado?
editorialFolderName            última pasta de material editorial usada
imgStems_{courseId}            cache dos nomes de imagem já publicadas
```

---

## Problemas comuns

- **Ícone no navegador não abre/fecha o painel:** certifique-se de estar em `cursos.alura.com.br`. Fora do Alura, o ícone abre o popup tradicional.
- **Upload de imagem/editorial falha com 403:** credenciais R2 inválidas ou sem permissão de write no storage.
- **Upload de ícone falha com 401:** Token GitHub sem escopo suficiente ou expirado.
- **"Primeira atividade inativa":** a primeira task do curso está desativada — abra o admin e ajuste a ordem antes de rodar a revisão.
- **Substituição de imagens não funciona no desafio:** publique a pasta `[courseId] imagens` **antes** de publicar o desafio — o substituidor de URL usa o nome do arquivo como chave.
- **Publicar material editorial erra a aula:** verifique se todos os PDFs começam com `AULA NN - ` (com o traço).

# Start — Facilitadora de Revisão

Extensão de navegador para equipes de conteúdo da Alura.
Automatiza revisão de cursos, auditoria de transcrições, publicação de atividades e desativação em lote.

> Compatível com Chrome e Edge (Chromium). Funciona em `cursos.alura.com.br`.

---

## Instalação

1. Baixe o repositório: botão verde **Code → Download ZIP**
2. Extraia o ZIP em uma pasta permanente (não mova depois de instalar)
3. Abra o gerenciador de extensões no navegador
4. Ative o **Modo do desenvolvedor**
5. Clique em **Carregar sem compactação** e selecione a pasta extraída
6. A extensão aparece na barra do navegador

Para atualizar: extraia o novo ZIP na mesma pasta e clique em **Recarregar** no gerenciador de extensões. Um banner de aviso aparece automaticamente quando há nova versão disponível.

---

## Configuração inicial

Na **aba Ferramentas**, salve o token antes de usar a extensão:

| Token | Para que serve |
|-------|----------------|
| **Token GitHub** | Upload de ícones durante a revisão |

O token fica salvo localmente no navegador e persiste entre sessões. Nunca fica exposto no código-fonte.

---

## Aba Revisão

### Ordem das atividades

Exibe o checklist da ordem esperada de atividades conforme a plataforma do curso. Selecione a plataforma no dropdown e marque cada item conforme for verificando:

| Plataforma |
|------------|
| StartLab |
| VS Code |
| Figma / p5.js / Python / IA / Cultura digital / Educação Midiática |
| Robótica |
| Curso técnico |

---

### Start revisão

Executa auditoria completa do curso. **Deve ser iniciado na Home do curso.**

Selecione o tipo de produto antes de iniciar:

| Tipo | Descrição |
|------|-----------|
| Curso Técnico | Regras específicas de quantidade de atividades por aula |
| EFAI | Ensino Fundamental — Anos Iniciais |
| EFAF | Ensino Fundamental — Anos Finais |
| EM | Ensino Médio |

**O que verifica:**
- Categorias certas
- Fórum bloqueado 
- Tema correto (START_EM ou START_EFAI)
- Acessa todas as aulas, ve se tem legenda nos videos (ao fim ele tem o botão para copiar todos os videos que faltam legendas)
- Corrige a ordem das atividades
- Exercicios com ou sem Luri.

---

## Aba Ferramentas

### Token GitHub

Salva o Personal Access Token (PAT) necessário para upload de ícones.

1. Cole o token no campo
2. Clique em **Salvar token**

---

### Auditoria de transcrições e legendagens

Audita múltiplos cursos de uma vez.

1. Cole os IDs dos cursos separados por vírgula ou espaço
2. Selecione o que verificar:
   - **Transcrição** — vídeo com mais de 50 caracteres
   - **Legendas em PT** — legenda em Português disponível no player
   - **Legendas em ESP** — legenda em Espanhol disponível no player
   - **Download textual** — baixa o conteúdo completo dos cursos em Markdown
3. Clique em **Auditar lista**

**Relatório gerado:**

- **Resumo** — visão consolidada por curso (cursos com pendências vs. cursos 100% corretos)
- **Detalhado** — lista de cada vídeo com pendência e status por check (`✅`/`❌`)

Opções de exportação: **Copiar** e **Baixar .txt**.

A auditoria fica salva no histórico com data e hora.

---

#### Download textual de cursos

Disponível como checkbox na auditoria em lote. Quando ativado, baixa o conteúdo estruturado de cada curso em Markdown ao finalizar a auditoria.

O que é extraído por curso:

- Nome, traduções (EN/ES), carga horária, meta description, público-alvo, autores e ementa
- Todas as seções e atividades com seus tipos
- Transcrições dos vídeos
- Alternativas corretas de exercícios com justificativas

Formatos gerados: um arquivo por curso (`{id}-{slug}.md`) e um arquivo consolidado com todos os cursos.

---

### Upload ícone Start

Faz o upload do ícone padrão Start para o curso atual.

**Deve ser iniciado na Home do curso** em `cursos.alura.com.br`.

---

### Desativar atividades em lote

Busca e desativa múltiplas atividades de um curso sem precisar entrar em cada uma manualmente.

1. Informe o **ID do curso**
2. Clique em **Buscar atividades**
3. Selecione as atividades a desativar (o ↗ ao lado de cada uma abre a atividade no admin em segundo plano sem fechar o popup)
4. Clique em **Desativar selecionadas**

Atividades já inativas aparecem riscadas e não podem ser selecionadas. O botão **Selecionar tudo** marca todas as ativas de uma vez.

A lista buscada é preservada automaticamente: se o popup fechar (ao clicar no ↗, por exemplo), ao reabrir a lista reaparece sem precisar buscar novamente. A lista é limpa após a conclusão da desativação.

---

## Aba Publicação

### Desafio

Publica o conteúdo da atividade "Para saber mais : Hora do desafio!" em cada aula de um curso, a partir de um arquivo `.txt` ou `.docx`.

**Formato esperado do arquivo:**

```
Aula 1
Nome da aula

Para saber mais : Hora do desafio!
[conteúdo da atividade]

Sugestão de solução
...

Aula 2
...
```

O nome do arquivo deve conter o ID do curso entre colchetes: ex. `Desafio [5275].txt`.

**Como usar:**

1. Arraste ou selecione o arquivo `.txt` ou `.docx`
2. A extensão detecta o ID do curso e lista as aulas encontradas
3. Publique aula por aula ou clique em **Publicar todas as aulas**

Suporte a `.docx` nativo (sem dependências externas): o parser lê o `word/document.xml` diretamente, preservando listas numeradas e formatação em Markdown.

---

### Faça como eu fiz

Publica atividades de múltiplos tipos em cada aula a partir de um arquivo `.txt` ou `.docx`.

**Tipos de atividade reconhecidos no documento:**

| Marcador no arquivo | Tipo de atividade |
|---------------------|-------------------|
| `PREPARANDO O AMBIENTE` | Preparando o ambiente |
| `FAÇA COMO EU FIZ` | Faça como eu fiz |
| `Opinião` | Opinião (anexada à atividade anterior) |
| `PARA SABER MAIS` | Para saber mais |
| `Glossário` | Glossário |

**Como usar:**

1. Arraste ou selecione o arquivo `.txt` ou `.docx`
2. A extensão lista as aulas e atividades encontradas
3. Publique aula por aula ou clique em **Publicar todas as aulas**

---

## Arquitetura

```
extensao-revisao/
├── manifest.json       # Configuração da extensão (MV3)
├── background.js       # Service worker — operações em abas e requisições externas
├── content.js          # Script injetado na Alura — orquestra os fluxos
├── popup.html          # Interface da extensão
├── popup.js            # Lógica da interface
└── icons/              # Ícones SVG por categoria de curso
```

**Fluxo de comunicação:**

```
popup.js
  └─► chrome.tabs.sendMessage ──► content.js
                                      └─► chrome.runtime.sendMessage ──► background.js
                                                                              └─► abre abas ocultas
                                                                              └─► executa scripts
                                                                              └─► retorna dados
```

Operações que exigem acesso ao admin são feitas pelo `background.js`, que abre abas em segundo plano, extrai os dados via `executeScript` e fecha as abas automaticamente.

O estado de execução é persistido em `chrome.storage.local`. Se a aba do curso for fechada durante um fluxo, a extensão retoma de onde parou ao reabrir a página.

A assinatura das requisições ao Amazon Bedrock usa **AWS SigV4** implementada diretamente no `background.js` via `crypto.subtle`, sem dependências externas.

---

## Permissões

| Permissão | Uso |
|-----------|-----|
| `scripting` | Executa scripts em abas do admin |
| `storage` | Salva estado de execução, histórico e tokens |
| `notifications` | Notifica ao finalizar auditorias |
| `downloads` | Baixa relatórios e arquivos de conteúdo |
| `activeTab` | Acessa a aba ativa ao iniciar operações |
| `https://*/*` | Acessa admin, video-uploader, CDN da Alura e GitHub API |

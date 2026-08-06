# CMS administrativo do portfólio — guia completo

Este documento cobre tudo sobre o sistema de edição visual criado nesta branch
(`feature/portfolio-cms`): o que foi feito, como rodar localmente, e o passo a
passo para colocar no ar de verdade (GitHub, Cloudflare Worker, Cloudflare
Access). Ele foi escrito para quem não mexe em código no dia a dia.

---

## Segunda revisão: espaçamento por bloco e validação final antes do deploy

### A. Estado anterior

O que já funcionava, confirmado de novo nesta rodada: a grade de projetos já
era 100% dinâmica (sem limite de 4), a navegação "próximo projeto" já era
calculada pela posição na lista (corrigida na revisão anterior), e duplicar/
excluir projeto já existiam no Worker e no painel.

O que estava faltando de verdade: espaçamento individual por bloco dentro da
página de projeto. Cada bloco (capa, cada seção de texto, galeria) só tinha
um número fixo de espaço, igual para todos os projetos, sem controle nenhum
no painel — apesar de o restante do CMS já ter o sistema de três níveis
(desktop/tablet/celular) pronto para o espaçamento de seção.

Nenhum bug de regressão foi encontrado nas áreas já entregues (grade
dinâmica, navegação, duplicar/excluir): o diff destes arquivos desde a
revisão anterior mostra zero alteração neles.

### B. O que foi implementado

**Espaçamento por bloco**, com os mesmos três níveis (desktop/tablet/celular,
os mesmos breakpoints 900px/640px, herança nível a nível) já usados no
espaçamento de seção — sem inventar um segundo sistema. Cada bloco de uma
página de projeto agora aceita:

- **espaço antes** (`margin-top`) e **espaço depois** (`margin-bottom`) — a
  capa, cada bloco de texto (contexto/processo/resultado) e a galeria;
- **espaço entre elementos** (`gap`) — só a galeria, que é o único bloco com
  mais de um elemento interno hoje.

Margem, padding e gap continuam sendo tratados como propriedades diferentes:
o espaço "antes/depois" de um bloco é margem (afasta o bloco dos vizinhos), o
espaço "entre elementos" é gap (afasta imagens umas das outras dentro do
mesmo bloco). Nenhum bloco atual tem padding interno próprio configurável — a
capa, o texto e a galeria não têm um "miolo" que precise de respiro interno
distinto da margem, então esse controle não existe porque não haveria o que
ele fizesse (documentado como limitação abaixo, não escondido).

**Onde os números moram:** dentro do próprio bloco, em
`content/projects/<slug>.json` — `blocks[i].spacing` para cada bloco de texto
e para a galeria, `coverSpacing` no nível raiz do projeto para a capa. Cada
um é `{marginTop:{desktop,tablet,mobile}, marginBottom:{...}}` (a galeria
ganha também `gap:{...}`). Um campo ausente ou `null` em qualquer nível significa
"sem valor próprio nesse nível", e o site usa o espaçamento que já existia
antes do CMS (2,6rem/41,6px entre blocos de texto, exceto o último; 1rem/16px
antes da capa e da galeria; 1,4rem/22,4px de gap na galeria) — nenhum projeto
existente mudou de aparência com esta implementação.

**Como chega à tela:** `js/content-render.js` calcula, para cada bloco, o
número final de cada nível (a personalização do bloco, ou o valor de
contexto que reproduz o espaçamento atual) e escreve como propriedade CSS
diretamente no elemento do bloco (`--block-mt-desktop` etc.) — o mesmo
desenho do espaçamento de seção, só que embutido no elemento em vez de em
`:root`, porque aqui quem varia é a instância do bloco, não a página inteira.
`css/style.css` só lê essas variáveis por faixa de largura; toda a lógica de
herança fica em JavaScript, testável e sem duplicação entre painel e site.

**No painel:** cada bloco (capa, cada seção de texto, galeria) ganhou sua
própria aba de dispositivo e os campos "Espaço antes" / "Espaço depois" (e
"Espaço entre elementos" na galeria), com o mesmo selo "próprio"/"herdando de
X" e botão "Voltar a herdar" já usados no espaçamento de seção.

### C. Testes — o que foi executado e como

| Teste | Ambiente | Resultado |
|---|---|---|
| Sintaxe de `js/content-render.js`, `worker/public/app.js` depois das mudanças | Navegador, `new Function()` sobre o arquivo servido | OK nos dois |
| Espaçamento de bloco sem nenhuma personalização (projeto existente, case-01) | Navegador, `getComputedStyle` nos 3 blocos de texto + capa + galeria | Valores exatamente iguais aos antigos (41,6px entre textos exceto o último, 0px no último, 16px antes da capa/galeria, 22,4px de gap) |
| Herança de um valor de bloco por dispositivo (desktop=120px, sem tablet, celular=48px) | Navegador, `getComputedStyle` em 700px e 390px de largura | Tablet herdou 120px do desktop; celular usou seu próprio 48px |
| Bloco sem nenhum campo de espaçamento no JSON (simulando um projeto recém-criado) | Navegador, chamando a mesma função de resolução isoladamente | Nenhum `NaN`/`undefined` no CSS gerado |
| Grade com 5 e 6 projetos simulados (quantidade ímpar e maior que 4) | Navegador, injeção do índice em memória + nova renderização | Renderizou todos, sem limite, sem erro |
| Whitelist de caminho, sanitização de slug/upload, JWT do Access | Navegador, execução isolada das funções do Worker | Mesmos resultados da revisão anterior — nenhuma proteção enfraquecida |

**O que não foi possível testar nesta sessão:** o fluxo completo de criar um
projeto pelo painel de verdade (abrir o painel publicado, clicar em "criar",
publicar, recarregar e confirmar persistência no GitHub) depende de um
Worker publicado com um token real do GitHub — nenhum dos dois existe neste
ambiente de desenvolvimento (sem Cloudflare, sem `wrangler`, sem Node/`npm`
instalados aqui). O que foi verificado, em vez disso, foi a corretude da
lógica de cada rota (`handleCreateProject`, `handleDuplicateProject`,
`handleDeleteProject` em `worker/src/index.js`) por leitura de código e por
execução isolada das funções puras que elas usam (validação de slug, gap,
espaçamento). Isso é revisão de código e teste unitário isolado, não teste de
integração — a diferença está registrada aqui de propósito, não apresentada
como "testado" sem qualificação.

### D. Limitações restantes

- Nenhum bloco tem padding interno configurável (só margem entre blocos e gap
  dentro da galeria) — nenhum bloco atual tem um "miolo" que precisasse disso.
- Criar/duplicar/excluir projeto pelo painel real, publicado, com um Worker
  de verdade: não testado nesta sessão (falta de credenciais/infraestrutura
  aqui, não falta de implementação — ver seção C).
- Tipografia, tamanhos de card além de "normal" e mídia em vídeo continuam
  como na entrega anterior: fora do escopo desta rodada.

### E. Um incidente durante esta revisão

Um comando de terminal usado para incrementar o número de versão dos
arquivos (`?v=N` no CSS/JS, para o navegador não servir a versão antiga em
cache) tinha um erro de sintaxe e, em vez de só trocar o número, apagou a
linha inteira do `<link rel="stylesheet">` e do `<script src=".../content-
render.js">` nos 5 arquivos HTML. Percebido e corrigido antes de qualquer
commit — nenhuma versão publicada chegou a ter esse problema. Registrado
aqui por transparência, não porque tenha afetado o resultado final.

---

## Revisão funcional antes do deploy

Antes de publicar, o sistema passou por uma segunda rodada de revisão focada
em cinco pontos. O que segue é o que foi de fato encontrado ao testar — não
uma lista do que deveria funcionar.

**Grade de projetos: já era dinâmica, nenhuma mudança precisou ser feita.**
Testado ao vivo com 6 projetos simulados: a grade renderizou todos, sem
limite de 4, sem `slice`, sem componente fixo por posição — ela sempre leu
`content/projects/index.json` por inteiro. O "4 projetos" que existe hoje é
só porque há 4 projetos reais cadastrados, não uma trava no código.

**Navegação "próximo projeto": tinha um bug real, corrigido.** Ela dependia
de campos `prevProject`/`nextProject` gravados à mão em cada JSON de
projeto. Um projeto novo, criado pelo painel, nascia com esses campos vazios
e os vizinhos dele nunca eram atualizados para apontar para ele — ou seja,
criar um 5º projeto não quebrava a grade (que já era dinâmica), mas ficava
com a navegação "próximo" cega para ele. Corrigido: a navegação agora é
calculada em `js/content-render.js` a partir da posição do projeto na lista
ordenada e visível de `projects/index.json`, a cada carregamento de página.
Testado inserindo um 5º projeto entre o 4º e o 1º: o "próximo" do 4º passou
a apontar para o novo projeto automaticamente, sem editar nenhum arquivo do
projeto 4. Os campos `prevProject`/`nextProject` foram removidos dos 4 JSONs
existentes (não fazem mais nada).

**Criar, duplicar e excluir projeto: as duas últimas não existiam, foram
adicionadas.** O painel só tinha "criar" e "editar". Agora tem `DELETE
/api/projects/:slug` (remove a entrada do índice, o JSON e a página HTML —
não apaga imagens em `assets/`, porque não há garantia de que não sejam
reaproveitadas em outro lugar) e `POST /api/projects/:slug/duplicate`
(clona o projeto de origem com um novo slug, título com "(cópia)" e nasce
como rascunho oculto). Os dois pedem confirmação no painel antes de chamar o
Worker.

**Espaçamento responsivo: era só desktop, agora é desktop/tablet/celular com
herança de verdade.** Antes, o painel só controlava o teto de telas grandes;
tablet e celular usavam um número fixo, igual para os dois, sem controle
nenhum. Agora cada seção da Home e cada espaçamento global têm três níveis
independentes (`{desktop, tablet, mobile}`), reaproveitando os dois pontos de
corte que o CSS já usava para outra coisa (900px e 640px) — nenhum
breakpoint novo foi criado. Um nível em branco herda o nível anterior da
mesma seção (celular herda tablet, que herda desktop); o painel mostra um
selo "herdando de X" ou "próprio" para cada campo, com um botão para voltar a
herdar. Testado nas três larguras: o valor renderizado (via
`getComputedStyle`) mudou corretamente em cada faixa.

Duas coisas quebraram nessa implementação e foram corrigidas antes de eu
considerar isso pronto:
1. A herança inicial calculava o tablet a partir do desktop *já resolvido*
   da seção, mesmo quando a seção inteira não tinha valor próprio nenhum —
   isso fazia `help`/`faq`/`contact` perderem o tablet de verdade do global
   (104px) e caírem de volta no desktop (96px). Corrigido: uma seção sem
   nenhum valor próprio agora herda cada nível do global diretamente, nível
   a nível, em vez de herdar o desktop emprestado como se fosse seu.
2. As regras de mídia responsivas de `.about-break` foram escritas antes da
   regra base dela no arquivo CSS — como as duas têm a mesma especificidade,
   a regra base (sem condição de largura) vencia sempre, e o padding de
   tablet/celular nunca mudava de verdade. Corrigido movendo as regras
   responsivas para depois da regra base.

`work` e `about` continuam com respiro maior que o padrão global, exatamente
como antes: a hierarquia sabe diferenciar "seção sem valor próprio, usa o
padrão global" (help/faq/contact) de "seção sem valor próprio, usa o número
fixo que já existia no CSS dela" (work/about) — sem essa distinção, ligar o
CMS teria encolhido essas duas seções para o valor genérico assim que o
painel fosse aberto pela primeira vez.

**O que ainda não está coberto**, por ser uma extensão real de escopo, não
uma correção do que já existia: espaçamento responsivo por bloco dentro da
página de projeto, gap interno do hero, distância título-texto e
texto-botão. Nenhum desses tinha QUALQUER token hoje — criar os três exigiria
adicionar CSS novo em vários lugares do hero e do template de projeto, o
tipo de expansão que este pedido especificamente pediu para evitar. Ficam
registrados aqui como próximo passo natural, não como pendência escondida.

**Segurança:** as mesmas checagens de whitelist de caminho, sanitização de
nome de upload e "falha fechada" do Cloudflare Access foram testadas de novo
depois de adicionar as rotas de excluir/duplicar (novas superfícies de
ataque em potencial) e continuam se comportando como antes — as duas rotas
novas passam pela mesma verificação de Access que todas as outras, e usam
regex nos parâmetros de URL que rejeitam `../` e caracteres fora de
`[a-z0-9-]`.

---

## A. Resumo técnico simples

**O que foi criado:** o portfólio continua exatamente o mesmo site estático de
sempre (HTML, CSS, JS, sem build), mas agora ele lê seu conteúdo — textos,
cores, espaçamentos, projetos — de arquivos `.json` em vez de ter tudo
"gravado" direto no HTML. Ao lado disso, foi criado um painel visual (uma
segunda aplicação, separada do site) onde você edita esses arquivos `.json`
sem precisar abrir código.

**Onde ficam os conteúdos:** na pasta `content/` do próprio repositório:
- `content/global.json` — cores, bordas, espaçamento, header, footer, redes sociais.
- `content/home.json` — todo o texto da página inicial.
- `content/projects/index.json` — a lista de projetos (ordem, visibilidade, capa).
- `content/projects/case-01.json` (e 02, 03, 04) — o conteúdo de cada projeto.

**Como o painel conversa com o GitHub:** o painel nunca fala com o GitHub
diretamente. Ele fala com o Cloudflare Worker (o "servidor" deste sistema), e
é o Worker que tem a chave de acesso ao GitHub e faz a leitura e a escrita
dos arquivos. Isso existe porque essa chave não pode nunca aparecer no
navegador — se ficasse no painel, qualquer pessoa que abrisse as ferramentas
do navegador poderia roubá-la.

**Qual é o papel do Cloudflare:** dois papéis diferentes. O **Worker**
hospeda o painel e a API (a "porta de entrada" para ler/escrever conteúdo).
O **Access** é quem decide quem pode abrir essa porta — só o seu e-mail.

**Como as alterações chegam ao site público:** quando você clica em
"Publicar" no painel, o Worker grava os arquivos `.json` alterados
diretamente no repositório do GitHub (branch `main`), criando um commit. O
GitHub Pages, que já publica esse repositório hoje, detecta o commit e
atualiza o site público sozinho, do mesmo jeito que já fazia antes — não foi
mudado nada nesse mecanismo.

O site público (`pedrodetrindade.com`) e o painel administrativo
(`admin.pedrodetrindade.com`, depois de configurado) são duas coisas
publicadas em lugares diferentes: o site continua no GitHub Pages, o painel
vive só no Cloudflare Worker.

---

## B. Arquivos alterados

### Criados

| Arquivo | Função |
|---|---|
| `content/global.json` | Cores, tipografia, bordas, layout, header, footer, redes sociais, SEO — os valores atuais viraram o padrão. |
| `content/home.json` | Todo o texto da Home: capa, projetos (introdução), sobre, "o que eu faço", FAQ, contato. |
| `content/projects/index.json` | Lista dos 4 projetos: ordem, visibilidade, capa, tags, ano. |
| `content/projects/case-0X.json` | Conteúdo completo de cada projeto (textos, capa, galeria). |
| `js/content.js` | Lê `content/global.json` (e o JSON da própria página) e aplica como variáveis de CSS **antes** da primeira pintura da tela — é o que faz o painel controlar cor/espaçamento/borda sem precisar editar CSS. |
| `js/content-render.js` | Reconstrói texto e listas (projetos, FAQ, "o que eu faço", galeria) a partir do JSON, depois que a página carrega. |
| `worker/wrangler.toml` | Configuração do Cloudflare Worker. |
| `worker/package.json` | Dependência única: `wrangler` (a ferramenta de linha de comando da Cloudflare). |
| `worker/.gitignore` | Garante que segredos locais nunca sejam versionados. |
| `worker/.dev.vars.example` | Modelo do arquivo de variáveis locais — copie e preencha, nunca vá direto nele. |
| `worker/src/index.js` | Rotas da API (`/api/global`, `/api/home`, `/api/projects`, `/api/uploads`, `/api/publish`...). |
| `worker/src/github.js` | Leitura e escrita de arquivos no GitHub via API oficial. |
| `worker/src/access.js` | Confere o login do Cloudflare Access a cada chamada da API. |
| `worker/src/validate.js` | Limites de segurança (tamanhos, whitelist de caminhos, nomes de arquivo). |
| `worker/public/index.html` | Estrutura do painel. |
| `worker/public/app.js` | Toda a lógica do painel (nenhum framework, JS puro). |
| `worker/public/styles.css` | Aparência do painel. |
| `assets/projetos/LEIA-ME.txt` | Instruções de como adicionar fotos sem editar código (de uma etapa anterior deste projeto). |
| Este arquivo (`CMS-README.md`) | Este guia. |

### Modificados

| Arquivo | O que mudou |
|---|---|
| `css/style.css` | Valores antes fixos (arredondamento, opacidade de borda, espaçamento de seção, largura de conteúdo) viraram variáveis com **o mesmo valor de antes como padrão** — nada muda visualmente até o painel escrever um valor diferente. |
| `index.html` e as 4 páginas em `work/` | Ganharam duas tags `<script>`: uma no `<head>` (`content.js`) e uma antes do `main.js` (`content-render.js`). |
| `.gitignore` (raiz) | Passou a ignorar `.dev.vars`, `.env` e o pacote completo da fonte Switzer (ver nota abaixo). |

### O que NÃO deve ser enviado ao GitHub

- `worker/.dev.vars` (se você criar um, a partir do `.example`) — tem o token do GitHub para uso local.
- `worker/node_modules/` e `worker/.wrangler/` — dependências e cache, recriados automaticamente.
- Qualquer `.env`.

Todos esses já estão no `.gitignore`; a única forma de infringir isso é usar
`git add -f`, o que você nunca precisa fazer aqui.

**Nota à parte:** ao arrumar o `.gitignore`, aproveitei para tirar do
controle de versão a pasta `Switzer_Complete/` e o zip (o pacote completo da
fonte, com formatos e pesos que o site não usa — o site carrega só um
arquivo `.woff2` de 43KB). Os arquivos continuam no seu disco, só saíram do
histórico do Git a partir de agora, porque não têm relação com o
funcionamento do site.

### Alterados na revisão pré-deploy

| Arquivo | O que mudou |
|---|---|
| `css/style.css` | Espaçamento de seção (global e por seção da Home) e gap da grade de projetos ganharam três variáveis cada (`-desktop`, `-tablet`, `-mobile`), reaproveitando os breakpoints 900px/640px que já existiam. |
| `js/content.js` | Resolve a herança de três níveis (global → seção, desktop → tablet → celular) antes de escrever as variáveis de CSS. |
| `js/content-render.js` | Navegação "próximo projeto" deixou de depender de campos gravados à mão e passou a ser calculada pela posição do projeto na lista ordenada e visível. |
| `content/global.json`, `content/home.json` | `sectionSpacingTop/Bottom` e `gridGap` (global) e `spacingTop/Bottom` (por seção) viraram objetos `{desktop, tablet, mobile}`. |
| `content/projects/case-0X.json` | Removidos os campos `prevProject`/`nextProject`, agora calculados em tempo real. |
| `worker/src/github.js` | Nova função `deleteFile`. |
| `worker/src/index.js` | Novas rotas `DELETE /api/projects/:slug` e `POST /api/projects/:slug/duplicate`; método `DELETE` liberado na checagem geral. |
| `worker/public/app.js` | Painel de layout ganhou seletor de dispositivo (Desktop/Tablet/Celular) com selos de herança; lista de projetos ganhou os botões Duplicar e Excluir. |

---

## C. Como executar localmente

### Pré-requisitos

- **Node.js** instalado (18 ou mais recente) — é o que roda o `wrangler`. Baixe em [nodejs.org](https://nodejs.org) se ainda não tiver.
- O site em si (`index.html`) não precisa de nada disso: continua abrindo direto no navegador.

### 1. Instalar

```bash
cd worker
npm install
```

### 2. Configurar o bypass local (para não depender do Cloudflare Access no seu computador)

```bash
cp .dev.vars.example .dev.vars
```

Abra `.dev.vars` e preencha `GITHUB_TOKEN` com um token de teste (ver seção D
para gerar um). Deixe `DEV_AUTH_BYPASS=true` — é isso que permite abrir o
painel localmente sem passar pelo login do Cloudflare Access.

**Nunca** copie esse arquivo para fora da sua máquina, nem o suba para
nenhum lugar. Ele já está no `.gitignore`, então `git status` nunca deve
mostrá-lo.

### 3. Iniciar o site (sem o painel)

Não precisa de servidor: dê duplo clique em `index.html`, ou, se preferir
testar como o navegador vê um servidor de verdade:

```bash
# na raiz do projeto (não dentro de worker/), com Python (se tiver) ou qualquer servidor estático
python3 -m http.server 8123
```

Depois abra `http://localhost:8123/`.

### 4. Iniciar o painel

```bash
cd worker
npm run dev
```

O terminal vai mostrar um endereço, geralmente `http://localhost:8787`. Abra
esse endereço no navegador — o painel deve carregar direto, sem pedir login,
porque `DEV_AUTH_BYPASS=true` está ativo.

Dentro do painel, na primeira aba (Visão geral), você pode configurar a "URL
da prévia" apontando para `http://localhost:8123/` (o site que você abriu no
passo 3) para ver as mudanças em tempo real.

### 5. Testar

Abra qualquer aba do painel (Aparência global, por exemplo), mude uma cor, e
veja a prévia reagir. As mudanças ficam só na memória do navegador até você
clicar em "Publicar" — nesse momento, o Worker tenta gravar de verdade no
GitHub usando o token que você colocou no `.dev.vars`. Se for um token de
teste sem permissão de escrita, a publicação vai falhar com uma mensagem
clara (é esperado, e seguro).

### 6. Parar o servidor

No terminal onde `npm run dev` está rodando, pressione `Ctrl+C`.

---

## D. Passo a passo do GitHub (Fine-grained Personal Access Token)

1. Entre em [github.com](https://github.com), clique na sua foto (canto
   superior direito) → **Settings**.
2. No menu da esquerda, role até **Developer settings** (é o último item).
3. Clique em **Personal access tokens** → **Fine-grained tokens**.
4. Clique em **Generate new token**.
5. Em **Token name**, dê um nome que você reconheça, tipo `cms-portfolio`.
6. Em **Expiration**, escolha um prazo — 90 dias é razoável; a Cloudflare vai
   te lembrar de trocar quando estiver perto de vencer.
7. Em **Repository access**, escolha **Only select repositories** e marque
   **só** o repositório do portfólio (o mesmo que hoje publica o site).
   Nunca escolha "All repositories".
8. Abra **Repository permissions** e ajuste:
   - **Contents**: `Read and write` (é o que permite ler e gravar os
     arquivos `.json` e as imagens).
   - Todos os outros ficam em `No access`.
9. Clique em **Generate token**.
10. O GitHub mostra o token **uma única vez**. Copie agora.

**Onde não salvar o token:** não cole em nenhum arquivo dentro da pasta do
projeto (exceto `worker/.dev.vars`, que é local e ignorado pelo Git), não
mande por e-mail, não cole em nenhum documento compartilhado. O único lugar
onde ele deve morar em produção é como **Secret** do Cloudflare Worker (ver
seção E).

**Como revogar e criar outro:** na mesma tela de **Fine-grained tokens**,
clique no token e depois em **Delete**. Gere um novo seguindo os passos
acima e atualize o Secret no Cloudflare (seção E, passo 7).

**Como confirmar que a publicação atual continua funcionando:** nada muda
no GitHub Pages em si. Para confirmar, acesse o repositório no GitHub →
**Settings** → **Pages**, e veja se a mensagem de "seu site está publicado
em..." continua aparecendo normalmente. Também vale simplesmente abrir
`pedrodetrindade.com` e ver se carrega.

---

## E. Passo a passo do Cloudflare Worker

### 1. Conta

Se ainda não tiver, crie uma conta gratuita em
[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).

### 2. Abrir Workers & Pages

No painel do Cloudflare, no menu da esquerda, clique em **Workers & Pages**.

### 3. Instalar e autenticar o Wrangler

No seu computador, dentro da pasta `worker/`:

```bash
npm install
npx wrangler login
```

Isso abre o navegador pedindo para autorizar o Wrangler a publicar na sua
conta Cloudflare. Aceite.

### 4. Criar e publicar o Worker

Ainda dentro de `worker/`:

```bash
npm run deploy
```

Na primeira vez, isso cria o Worker `portfolio-admin` (o nome vem de
`worker/wrangler.toml`) na sua conta e já publica o painel e a API. O
terminal mostra a URL pública, algo como
`https://portfolio-admin.SEU-SUBDOMINIO.workers.dev`.

### 5. Adicionar as variáveis (Variable) e o segredo (Secret)

**Diferença entre os dois:** uma **Variable** fica visível em texto puro
para qualquer pessoa com acesso ao painel do Cloudflare do seu time — serve
para configuração comum, nunca para senha. Um **Secret** é criptografado, e
depois de criado nem você consegue mais ver o valor de volta, só substituir
— é onde o token do GitHub tem que morar.

`GITHUB_OWNER`, `GITHUB_REPO` e `GITHUB_BRANCH` já vêm preenchidos em
`worker/wrangler.toml` como Variables (você pode conferir/editar esse
arquivo antes do deploy, se o nome do seu usuário ou repositório for
diferente).

Para adicionar o Secret do GitHub:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Cole o token gerado na seção D quando for pedido. Ele fica salvo,
criptografado, ligado a este Worker.

### 6. Testar o Worker

Abra a URL `.workers.dev` que apareceu no passo 4. Sem o Cloudflare Access
configurado ainda, o painel deve aparecer, mas qualquer chamada de API vai
recusar com "unauthorized" — é o esperado até a seção F estar pronta.

Para conferir que a API está no ar:

```bash
curl https://portfolio-admin.SEU-SUBDOMINIO.workers.dev/api/status
```

(Vai devolver `unauthorized` até o Access estar configurado — é a resposta
correta neste ponto.)

### 7. Configurar um domínio próprio (depois)

No painel do Worker (Workers & Pages → portfolio-admin → Settings →
Domains & Routes), clique em **Add** → **Custom domain**, e digite
`admin.pedrodetrindade.com` (ou o subdomínio que preferir). O Cloudflare
pede para confirmar que o domínio já está na sua conta Cloudflare (o mesmo
onde está configurado `pedrodetrindade.com`, já que o `CNAME` do repositório
aponta para lá).

### 8. Novo deploy no futuro

Sempre que quiser atualizar o painel ou a API depois de uma mudança de
código:

```bash
cd worker
npm run deploy
```

---

## F. Passo a passo do Cloudflare Access

### 1. Abrir o Zero Trust

No painel do Cloudflare, menu da esquerda → **Zero Trust** (pode pedir para
criar a organização na primeira vez).

### 2. Criar a organização (se for a primeira vez)

Escolha um nome de equipe (isso vira o seu **Team Domain**, algo como
`seunome.cloudflareaccess.com` — guarde esse endereço, ele é o
`ACCESS_TEAM_DOMAIN`).

### 3. Configurar autenticação

Em **Settings** → **Authentication**, você pode manter o método padrão
"One-time PIN" (código temporário por e-mail) — não precisa configurar
Google/GitHub/etc. só para isso.

### 4. Habilitar código por e-mail

Isso já vem ativo por padrão no método "One-time PIN". Não precisa de passo
extra.

### 5. Criar uma aplicação self-hosted

Em **Access** → **Applications** → **Add an application** → **Self-hosted**.

### 6. Informar o domínio do painel

Em **Application domain**, coloque o domínio do Worker: a URL `.workers.dev`
enquanto ainda não tiver domínio próprio, ou `admin.pedrodetrindade.com`
depois de configurado (seção E, passo 7).

### 7. Criar a política Allow

Na etapa de políticas, crie uma com:
- **Action**: Allow
- **Include**: Emails → coloque o seu e-mail

### 8. Bloquear os demais

Não é preciso fazer nada extra: o Access já nega por padrão qualquer pessoa
que não bata com nenhuma política Allow.

### 9. Encontrar o Team Domain

Zero Trust → **Settings** → **Custom Pages** (ou a barra lateral mostra
"seunome.cloudflareaccess.com" no topo) — esse é o `ACCESS_TEAM_DOMAIN`.

### 10. Encontrar o Application Audience (AUD)

Dentro da aplicação que você criou (Access → Applications → clique nela),
role até **Application Audience (AUD) Tag** — é uma sequência longa de
letras e números. Esse é o `ACCESS_AUD`.

### 11-13. Adicionar as três variáveis no Worker

Edite `worker/wrangler.toml` e preencha:

```toml
ACCESS_TEAM_DOMAIN = "seunome.cloudflareaccess.com"
ACCESS_AUD = "a sequência copiada no passo 10"
ADMIN_EMAIL = "seu-email@exemplo.com"
```

Depois publique de novo:

```bash
cd worker
npm run deploy
```

### 14. Testar em janela anônima

Abra o endereço do painel numa janela anônima/privada. Você deve ver a tela
de login do Cloudflare Access (pedindo e-mail) antes de qualquer coisa do
painel aparecer.

### 15. Confirmar que alguém não autorizado não entra

Peça para outra pessoa (ou use outro e-mail seu) tentar abrir o mesmo
endereço. O Access deve recusar o e-mail que não está na política Allow.

### 16. Encerrar sessões

Zero Trust → **My Team** → **Users**, encontre a sessão e revogue, se
precisar derrubar um acesso ativo antes da expiração natural do login.

---

## G. Teste final guiado

```text
[ ] Abrir o painel (URL do Worker ou admin.pedrodetrindade.com)
[ ] Receber o código no e-mail
[ ] Entrar
[ ] Alterar uma cor
[ ] Alterar um espaçamento
[ ] Visualizar (prévia dentro do painel)
[ ] Publicar
[ ] Confirmar o commit no GitHub (aba "Commits" do repositório)
[ ] Confirmar o deploy (Settings → Pages mostra a última publicação)
[ ] Abrir o site público
[ ] Confirmar a alteração
```

---

## H. Solução de problemas

**Painel não abre / tela em branco.** Veja o console do navegador
(F12 → Console). Se aparecer erro de rede em `/api/...`, o Worker pode estar
fora do ar — rode `npx wrangler tail` (dentro de `worker/`) enquanto recarrega
a página, para ver o erro do lado do servidor.

**Código de acesso não chega.** Confira a caixa de spam. Confirme que o
e-mail digitado é exatamente o mesmo cadastrado na política Allow (seção F,
passo 7) — maiúscula/minúscula não importa, mas espaço extra ou domínio
diferente sim.

**Acesso negado.** Confirme que seu e-mail está na política Allow do Access
e que `ADMIN_EMAIL` no Worker é exatamente esse e-mail (o Worker faz uma
segunda checagem própria, além do Access).

**Worker retorna 401.** Ou o Cloudflare Access não autenticou a sessão (faça
login de novo), ou as três variáveis `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`/
`ADMIN_EMAIL` não foram configuradas — sem as três juntas, o Worker recusa
tudo de propósito.

**Worker retorna 403.** Normalmente é a whitelist de caminhos recusando uma
escrita fora do permitido, ou o Access autenticou mas com um e-mail diferente
do `ADMIN_EMAIL`.

**Token do GitHub inválido.** Gere um novo (seção D) e atualize o Secret:
`npx wrangler secret put GITHUB_TOKEN`.

**Arquivo não encontrado.** O caminho pedido não existe ainda no repositório
— comum ao tentar editar um projeto que não foi criado pelo painel. Use
"Novo projeto" em vez de editar um slug que não existe.

**Conflito de SHA.** Alguém (ou outra aba) alterou o mesmo arquivo entre
você abrir o painel e publicar. Recarregue o painel (isso busca o SHA atual
de novo) e refaça a alteração.

**Commit criado, mas site não atualizado.** GitHub Pages geralmente
atualiza em menos de um minuto. Se passar de alguns minutos, veja
Settings → Pages no GitHub por uma mensagem de erro de build.

**Domínio não conectado.** Confirme em Cloudflare → seu domínio → DNS que
existe um registro apontando para o Worker (o próprio botão "Add custom
domain" do passo E.7 cria isso sozinho — se falhar, confira se o domínio
está mesmo ativo nessa conta Cloudflare).

**CORS.** Não deveria acontecer neste projeto: painel e API vivem na mesma
origem (o mesmo Worker serve os dois). Se aparecer um erro de CORS, é sinal
de que o painel está sendo aberto de um endereço diferente do Worker (por
exemplo, um `file://` local) — abra pela URL do Worker.

**Upload muito grande.** O limite é de 25MB por arquivo de mídia e 32MB de
mídia em uma mesma publicação. São aceitos JPG, PNG, WebP, AVIF, SVG, GIF,
MP4, WebM e PDF. Para arquivos maiores, use uma URL HTTPS direta no bloco de
imagem/galeria/vídeo ou Vimeo no bloco de vídeo. O limite de 200KB vale apenas
para cada arquivo JSON editorial; o corpo de `/api/publish`, que transporta os
binários em base64, tem uma régua separada de 48MB.

**Configuração inválida.** O painel e o Worker aplicam os mesmos limites
(0–200px de arredondamento, 320–2560px de largura, 0–600px de espaçamento,
0–100% de opacidade). Um valor fora disso é ajustado automaticamente para o
limite mais próximo.

**Segredo cadastrado como variável comum.** Se `GITHUB_TOKEN` foi colocado
em `wrangler.toml` (Variable) por engano em vez de Secret, ele fica visível
em texto puro no painel do Cloudflare. Remova a linha de `wrangler.toml`,
rode `npx wrangler secret put GITHUB_TOKEN` e publique de novo.

**Token expirado.** O GitHub para de aceitar chamadas com um erro claro
("token não aceito"). Gere um novo na seção D e atualize o Secret.

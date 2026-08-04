# CMS administrativo do portfólio — guia completo

Este documento cobre tudo sobre o sistema de edição visual criado nesta branch
(`feature/portfolio-cms`): o que foi feito, como rodar localmente, e o passo a
passo para colocar no ar de verdade (GitHub, Cloudflare Worker, Cloudflare
Access). Ele foi escrito para quem não mexe em código no dia a dia.

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

**Upload muito grande.** Limite de 5MB por imagem. Comprima a imagem antes
de enviar.

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

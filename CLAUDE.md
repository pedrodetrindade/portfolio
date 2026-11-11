# Portfólio Pedro de Trindade

Site de portfólio pessoal. HTML, CSS e JS puro, sem framework e sem build.
Basta abrir `index.html` no navegador, não há servidor nem instalação.

**Leia `PROJETO-PORTFOLIO.md` antes de editar.** Ele traz o objetivo, a direção
visual, a estrutura das seções e os próximos passos do projeto.

## Convenções que quebram o site se ignoradas

**Cache dos assets.** `css/style.css` e `js/main.js` são compartilhados pelas 5
páginas e os links carregam `?v=N`. Ao editar qualquer um dos dois, incremente esse
número em todas as páginas (`index.html` e `work/case-0*.html`), senão o navegador
continua servindo a versão antiga e a mudança parece não ter funcionado.

**Bilíngue.** Todo elemento com texto visível precisa de `data-pt` e `data-en`.
O JS troca o `innerHTML` a partir desses atributos. Isso vale também para datas
(Abr/Apr, Ago/Aug, Set/Sep) e para textos dentro de atributos de acessibilidade.

**Chrome compartilhado.** O menu overlay, o painel de contato e o véu de transição
são injetados por `js/main.js` em todas as páginas. Não duplique essa marcação no
HTML. Para mudar o menu, edite o array `MENU` no topo do arquivo.

**Caminhos relativos.** As páginas em `work/` usam `../` para css, js e voltar à
home. O JS detecta a pasta com `location.pathname.includes('/work/')`.

## Paleta

Escura, monocromática e levemente quente, puxada para marrom. Tudo sai dos
tokens em `:root`: `--ink` #0D0A0A (fundo), `--ink-2` #261B1D (superfícies),
`--ink-3` #403638 (elevadas), `--paper` #F2EEEE (texto), `--muted` #B7ACAC
(secundário), `--muted-2` #938787 (subiu de #8A7E7E para passar 4,5:1 sobre `--ink-2` nos cards), `--accent` #A29595, `--cream` #C9BDBD.

Para compor alpha use os triplets `--paper-rgb`, `--ink-rgb` e `--warm-rgb`
dentro de `rgba()`. Não escreva valores literais de cor em componente.

Nenhuma seção usa fundo claro. A separação vem de elevação mínima de tom,
hairlines e ritmo vertical.

## Tipografia

Tracking baixo, natural e editorial. Teto de `.06em`, e só em rótulo curto.
Corpo em `normal` ou `-.01em`, títulos entre `-.02em` e `-.05em`, rótulos
pequenos entre 0 e `.04em`. Tracking alto é o que faz um layout parecer
gerado por IA: não volte a subir esses valores.

## Sistema de movimento

Dois easings e cinco durações em `:root`. Use os tokens, não invente valores:
`--ease-soft` (.16,1,.3,1), `--ease-smooth` (.22,1,.36,1), `--dur-micro` 350ms,
`--dur-fast` 500ms, `--dur-default` 700ms, `--dur-slow` 1000ms, `--dur-reveal` 1200ms,
`--dur-ambient` 1600ms. `--ease-out-smooth` e `--ease-out-expo` continuam como aliases legados.
Nada de `ease-in-out` genérico, nada linear, nada de `transition:all`, nada
elástico e nada de bounce.

**Hover é `--dur-micro`.** Subir isso deixa a interface com resposta atrasada.

Entradas usam `.reveal`: 24px de deslocamento e opacidade, 650ms, escalonadas
em 70ms com teto de 6 passos. Títulos sobem de 32px, rótulos de 14px, mídia de
30px com escala .988. Sem blur em entrada.

**Nenhum `filter:blur()` no site.** Gradiente radial já é suave por natureza e
o blur só custava pintura. Se precisar de brilho, alargue os stops do gradiente.
`backdrop-filter` continua permitido no vidro fosco da UI flutuante. A única
exceção é a etapa 1 da intro (o `acende-nome` clássico ou o morph): um elemento,
um instante, antes de existir rolagem.

**Um único listener de scroll**, passivo e com throttle por rAF, alimenta
header e scrub. Não adicione outro: some no
laço existente em `js/main.js`.

O scroll por inércia é próprio, sem biblioteca, com decaimento por tempo:
`LERP_60` .047 por quadro a 60Hz (corrigido pelo dt real), o que dá ~0,35s de
constante de tempo no atraso. Era .04 (~0,41s) e Pedro achou pesado: pediu 15%
menos efeito, e 15% é medido nessa constante de tempo, -1/(60·ln(1-lerp)), não
no número do lerp. Saltos grandes aceleram até .32 e, a partir de 2,5 telas,
alinham no mesmo quadro. `?lerp=0.08` testa outro valor sem editar arquivo.

**Abrir com `?nosmooth=1` desliga a inércia** e devolve a rolagem nativa. É a
chave de comparação para separar custo de pintura de custo de dirigir o scroll
por JS. O painel de preview do Claude Code não reproduz nenhum dos dois: ele
roda sem sincronia vertical e mediu 4,2ms por quadro com ou sem
`backdrop-filter` e com ou sem `mix-blend-mode`. Qualquer investigação de
fluidez precisa acontecer no navegador real.

**A rolagem suave é por transform, não por `window.scrollTo`.** O conteúdo
(`main` + `footer`) é envolvido pelo `.smooth-holder`, que é `position:fixed` e
persegue `window.scrollY` com `translate3d`. A roda nunca é interceptada, então
a rolagem nativa segue no compositor. A versão anterior usava
`{passive:false}` + `preventDefault` + `scrollTo` por quadro e engasgava.

**Isso quebra tudo que depende de interseção com a viewport.** O navegador não
reavalia interseção quando o deslocamento vem de transform de ancestral. Duas
consequências já custaram caro e não podem voltar:
- `IntersectionObserver` não dispara. Por isso a entrada dos blocos é feita por
  comparação de posição dentro do laço de scroll (`medirAlvos`/`pintarEntradas`),
  não por observador. Sem isso, tudo abaixo da primeira dobra fica invisível.
- `loading="lazy"` nunca carrega. Nenhuma imagem do site pode usá-lo.

As posições medidas por `medirAlvos` envelhecem toda vez que a altura do
conteúdo muda, e isso acontece sempre que uma imagem carrega numa galeria
adaptativa (a proporção real só é aplicada no `load`). No ramo suave, o
`ResizeObserver` do `.smooth-holder` remede; sem holder (toque, movimento
reduzido, `?nosmooth=1`) o mesmo papel é de um `ResizeObserver` no `<main>`.
Sem ele, no celular, lâminas, painéis e banners largos ficavam em branco na
tela e só entravam centenas de pixels depois.

Âncoras também precisam de tradução: a posição do alvo na tela vem do transform
atrasado, então o clique em `a[href^="#"]` é interceptado e convertido para
coordenada de conteúdo antes de rolar.

**As camadas fixas de fundo levam `will-change:transform`** (`.glow`, `.grain`
e `header`). Rolagem dirigida por JS repinta todo `position:fixed` a cada
quadro; promovidas ao compositor, elas viram textura pronta na GPU. É disso
que o Lenis do midu.design depende para parecer fluido. Não espalhe
`will-change` além dessas três: em excesso ele consome memória de vídeo e
piora o que deveria melhorar.

**`mix-blend-mode` em tela cheia custa tanto quanto `filter:blur()`.** Uma
camada fixa cobrindo o viewport com blend obriga o navegador a remisturar tudo
a cada quadro. O `.grain` global usa opacidade simples por isso. Blend segue
permitido em elemento pequeno, onde a área é limitada.

**O fundo de vidro líquido é só da capa.** Já serviu projetos e sobre também,
mas voltou atrás: as duas destoavam do resto do site, que é todo `--ink` plano
(mesma cor em projetos, rodapé e "o que eu faço"). A classe ficou genérica,
`.liquid-bg`, porque é reutilizável, não porque está em uso em mais de um
lugar. Se um pedido futuro for "o mesmo fundo em outra seção", primeiro
confirme se é o vidro líquido animado que devem querer, ou o plano que já é
o padrão do site — da última vez era o segundo.
Exceção pedida depois, com todas as letras: o **Sobre tem fundo próprio**
(ver "O Sobre tem tom e névoa próprios", mais abaixo). Não é vidro líquido.

**Fundo fora da tela não anima.** O laço de scroll marca `.parado` no
`.liquid-bg` quando ele está a mais de uma tela de distância, e o CSS aplica
`animation-play-state:paused`. Nada de `display:none` ali: a camada precisa
continuar composta para não repintar do zero ao voltar. `medirFundos()`
acompanha `medirAlvos()` em toda remedição. Hoje só a capa usa `.liquid-bg`,
então o mecanismo é infraestrutura pronta para quando outra seção precisar,
não algo em uso agora.

**Help e FAQ cabem numa tela de 1920x1080** (`min-height:100svh`, não mais
112svh). `#work` e `#contact` ficam de fora desse grupo de propósito: `#work`
é a seção mais longa da página e não deve encolher junto; `#contact` saiu
depois, porque centralizar um conteúdo curto (headline, e-mail, dois links)
numa caixa quase do tamanho da tela deixava grande demais o vazio entre o fim
do conteúdo e a linha do rodapé. `#contact` cresce só pelo próprio conteúdo
mais o padding, como `#work`. Se o conteúdo de help ou faq crescer (mais um
item de FAQ, um parágrafo maior), o `min-height` deixa de mandar e a seção
cresce pelo próprio conteúdo, sem quebrar o layout.

**O disclaimer do rodapé mora empilhado com o "voltar ao topo",** dentro de
`.foot-row` (agora `flex-direction:column`), não sozinho depois do marquee e
não mais na mesma linha do botão. Ele já morou sozinho depois do marquee, na
faixa que `.edge-blur` (o desfoque fixo do fundo da janela) borra
permanentemente, e ficava difícil de ler. O marquee, decorativo e com baixa
opacidade, é o fim visual real da página; o bloco utilitário (voltar ao topo
em cima, crédito embaixo) fica acima dele, os dois centralizados.

**Contato e rodapé formam uma viewport exata no desktop.** `js/main.js` mede
a altura real do `footer` com `ResizeObserver` e publica
`--footer-block-height`; `#contact` ocupa o restante de `100svh`. Não substitua
essa medida por uma altura fixa nem adicione espaço depois do marquee: ele
encosta na base da página e o `.edge-blur` permanece ativo sobre essa faixa.

**O indicador "continue" da hero (`.next-hint`) é sempre centralizado por
`left:50% + translateX(-50%)`.** Qualquer regra que troque o `transform` dele
(a entrada disparada pela intro, por exemplo) precisa manter o
`translateX(-50%)` e mexer só no eixo Y, senão o botão perde a centralização
e ainda "desliza" de lado ao entrar. Já aconteceu: a transição de
`intro-mode` para `hero-sec` sobrescrevia o transform inteiro para
`translateX(10px)` → `none`, produzindo um botão torto com uma animação
lateral indesejada em vez de só opacidade e um leve movimento vertical.

**O header não tem fundo de largura cheia.** A marca continua protegida por um
`drop-shadow` curto e acompanha o tema claro/escuro da seção. Já a pílula de
Menu/Disponibilidade e o seletor de idioma usam um material fixo escuro,
translúcido e quente, definido pelos tokens `--floating-*`. Esse vidro não
inverte sobre FAQ ou capas claras: é justamente a superfície estável que
garante contraste em qualquer trecho e faz o estado fechado, o menu aberto e
o dropdown de idioma parecerem partes do mesmo sistema. Os filhos desses
controles removem o `drop-shadow`, porque o próprio material já os protege.

**Cards com capa predominantemente clara (o amarelo do Assertivo, por
exemplo) usam `coverLight:true` em `content/projects/index.json`.** A classe
`.card--light` faz marca e CTA do header trocarem para o tema escuro enquanto
o card passa por baixo; Menu e idioma preservam o vidro fixo.
`js/main.js` (`medirClaros`/`pintarClaros`) mede a posição documento-relativa
de todo `.card--light` e liga a classe pela mesma lógica de comparação de
posição por scroll que o resto do arquivo usa (`medirAlvos`/`pintarEntradas`,
`medirFundos`/`pintarFundos`) — não `IntersectionObserver`, que não reavalia
quando o deslocamento vem do transform do `.smooth-holder`. Editável pelo
painel do CMS (campo "Capa clara?" no editor de projeto).

## Sangramento de ponta a ponta

**Use `var(--vw)`, medido pelo JS, e não `calc(100vw - var(--sbw))`.** A regra
antiga assumia que `100vw` inclui a barra de rolagem. Isso era verdade e deixou
de ser quando `html` ganhou `scrollbar-gutter:stable`: o Chrome passou a
resolver `100vw` já sem a calha, e o desconto virou desconto em dobro. O
sintoma era discreto, 7,5px de folga de cada lado, e por isso sobreviveu muito
tempo em capa, sobre, FAQ, marquee e faixa de projetos.

`--vw` é `document.documentElement.clientWidth`, medido em `resize` e também
por um `ResizeObserver` no `documentElement`. O observador não é redundante:
abrir um item do FAQ numa página curta faz a barra de rolagem nascer e encolhe
a largura útil sem disparar `resize`.

## Desempenho: como medir e o que já foi feito

**A aba do Chrome dirigida pela extensão roda a 1 quadro por segundo** (janela
sem foco): qualquer medida de quadros feita ali é inválida. Meça com o Chrome
sem interface, por trace (puppeteer-core, que vem com o Lighthouse do npx):
custo da thread principal parado na capa, rolando a Home inteira com a roda e
parado no fim, e o que invalida estilo, layout e pintura
(`disabled-by-default-devtools.timeline.invalidationTracking`). Lighthouse
pelo `npx lighthouse@12` no site publicado, celular e desktop.

Rodada de 10/11/2026, sem mudar nada visível (antes → depois, Chrome sem
interface a 1920x1080): parado na capa 10,7% → 6,7% da thread principal;
rolando a Home 32% → 24,5%, quadros descartados 158 → 90; parado no fim 21% →
4,8%, com pintura e layout a zero. O que mudou:
- cordão do crachá por transform e pausa pela distância do próprio crachá;
- `dither-capa.js` prepara só a próxima imagem: as seis texturas subindo
  juntas viravam uma tarefa de ~460ms no celular do Lighthouse, na intro;
- `projects/index.json` era pedido duas vezes por XHR síncrono na Home (capa
  e grade): agora uma, por `indiceDaCapa()`;
- as `<img>` da capa, escondidas atrás do dither, não transicionam mais a
  opacidade a cada troca; as entradas por blur terminam em `filter:none`;
- posições dos uniforms do WebGL guardadas, não buscadas por quadro;
- capa do case com `fetchpriority="high"` e imagens das galerias com `low`.

No site publicado, depois da rodada: parado na capa 5,9%, rolando 25,4%,
parado no fim 3,8%. Lighthouse desktop 85 → 88 (bloqueio 210 → 130ms). **O
Lighthouse do celular não serve para comparar rodadas**: o mesmo código deu
36, 39 e 58 seguidos, porque a espera dos XHR síncronos do `content.js` (que
o Lighthouse conta como script) variou de 0,18s a 1,9s conforme a resposta do
GitHub atrás do Cloudflare. Compare pelo trace, que não depende da rede.

O que ficou de fora de propósito, com o motivo:
- **O XHR síncrono do `content.js` continua.** É o maior custo de carga (o
  Lighthouse do celular cai a ~45 por ele e pela intro), mas é o que garante
  zero flash de conteúdo antigo; trocar mudaria a abertura. Caminho, se um dia
  for preciso: o Worker escrever tokens e dados direto no HTML ao publicar.
- **As massas da capa (`.lq`) animam na thread principal**: o Chrome recusa a
  composição (`compositeFailed` 131072) com ou sem máscara, `will-change`,
  opacidade ou unidades em px. Custa ~6% parado na capa.
- Quatro WebP pesados (foto-time 584KB, capa-cordao 380KB, capa-case-cordao
  448KB, camisa-loud 375KB) estão com qualidade ~2,5× acima das outras.
  Recomprimir muda pixels: decisão de Pedro.
- **`main,footer{opacity:0}` não tem a guarda `.js`.** A classe `js` só nasce
  no `main.js`, no fim do body; com a guarda, o conteúdo piscaria antes da
  intro. O preço é a página em branco se o `main.js` não rodar.

**A prévia do CMS só aceita o painel** (`origemDoPainel` em `content.js`:
`https://admin.pedrodetrindade.com` e localhost). Antes qualquer site abria o
portfólio com `?cmsOrigin=` da própria origem e mandava "rascunho", e o texto
chega ao `innerHTML` pelo `setLang`: era injeção de script no domínio real.

**Âncora na URL com rolagem suave** (`/#work`, `/#about`, o breadcrumb e o
rodapé dos cases): o conteúdo vai para o holder fixo antes de o navegador
tratar o fragmento, e ele não rola até um alvo dentro de container fixo. O
`main.js` (`irParaAncora`) faz a conta do clique em âncora na abertura, de
novo quando a fonte chega e no `load`, se a pessoa ainda não rolou.

## CMS (painel administrativo)

O site tem um CMS próprio: um Cloudflare Worker em `worker/` (código em
`worker/src/`, painel estático em `worker/public/`), publicado em
`https://admin.pedrodetrindade.com`, atrás de Cloudflare Access. Ele edita
`content/*.json`, publica em `main` via GitHub API (um commit por publicação)
e tem prévia ao vivo por `postMessage`. Ver `CMS-README.md` para o desenho
completo e `worker/wrangler.toml` para a configuração de deploy.

**Cloudflare Access é a barreira de verdade; o Worker reconfirma sozinho.**
`worker/src/access.js` valida o JWT (`Cf-Access-Jwt-Assertion`) contra o JWKS
do time, o `aud` e o e-mail autorizado, e falha fechado se qualquer uma das
três variáveis (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAIL`) estiver
vazia. Essas três **não ficam em `wrangler.toml`**: são identificadores de
configuração, não segredos, mas `ADMIN_EMAIL` é pessoal e o repositório é
público — vivem só no painel do Cloudflare (Workers & Pages →
`portfolio-admin` → Settings → Variables).

**`keep_vars = true` no topo de `worker/wrangler.toml` não é opcional.** Sem
ele, `wrangler deploy` sobrescreve a configuração remota com a do arquivo —
aconteceu em 08/08/2026: as três variáveis do Access estavam declaradas como
`""` ali, o deploy as apagou em produção, e o painel passou a recusar toda
chamada com 401 depois do login (o Access continuou barrando normalmente
antes disso; não houve exposição). A chave precisa ficar no **topo** do
arquivo, antes de `[assets]`/`[[routes]]`/`[vars]`: no TOML, uma chave escrita
depois de um cabeçalho de tabela pertence àquela tabela, e um `keep_vars`
solto no fim vira campo de `[[routes]]` e derruba o deploy.

**`content/projects/index.json` não é o arquivo de um projeto, mas "index"
também casa `[a-z0-9-]+`.** Qualquer trecho do Worker que precise decidir "este
caminho é de um projeto?" tem que excluir esse arquivo explicitamente — é o
que `slugDeProjetoNoCaminho()` em `worker/src/index.js` faz. Sem essa exclusão,
o índice é validado como se fosse um projeto chamado "index", que exige dele
um campo `slug` que ele nunca teve (ele tem `$schema`, `cardSizes` e
`projects`), e toda publicação que tocar o índice — o que inclui simplesmente
mudar o título de um projeto, que sincroniza os dois arquivos — morre com 422
`slug_mismatch`. Isso já aconteceu em produção e passou despercebido por dias
porque as publicações anteriores nunca tinham mexido no índice.

**Windows/PowerShell: use `npm.cmd`/`npx.cmd`, nunca `npm`/`npx` puros.** A
política de execução padrão do PowerShell é `Restricted` e bloqueia todo
`.ps1`, inclusive os atalhos que o Node instala. O erro é "a execução de
scripts foi desabilitada neste sistema". No Git Bash, `npm`/`npx` normais
funcionam.

### Blocos da página de projeto

`content/projects/<slug>.json` descreve o corpo do case em `blocks`, uma
lista **ordenada** — a ordem no array é a ordem real na página, renderizada
por `renderBlocks()` em `js/content-render.js`. Cinco tipos: `text`, `image`,
`gallery`, `quote`, `video` (arquivo ou Vimeo). Blocos de `text` vizinhos são
agrupados numa `<section>` só (é o que reproduz o espaçamento de
contexto/processo/resultado); qualquer outro tipo ganha a sua própria seção.
O Worker valida cada bloco (`erroNosBlocos` em `worker/src/validate.js`): tipo
ou campo desconhecido, ou `src` fora de `assets/`, derruba a publicação com
422 — o painel valida de novo por conveniência, mas quem decide é sempre o
Worker.

O editor de blocos no painel (`worker/public/app.js`) reordena, duplica e
remove sempre redesenhando a lista inteira: os ids dos campos carregam o
índice do bloco, e remendar o DOM deixaria ids apontando para o bloco errado
depois de mover um item.

**`showLabel` (em blocos de texto) e `showEyebrow` (no hero do case) seguem a
mesma regra:** ausência do campo = ativo; `false` = oculto, com o texto
preservado e sem deixar espaço residual. Nunca gravar `false` a partir de uma
UI que só desliga; reativar remove o campo, não grava `true`.

**Capa do case é 16:9 com recorte, exceto panorâmica.** A partir de 2,4:1
a moldura segue a proporção da própria imagem (`.case-cover.is-panoramica`,
`--case-cover-ratio`), medida no `load` por `content-render.js`, sem campo no
CMS. Nasceu com o dgzin, cuja capa de 3,14:1 perderia as mãos que enquadram o
logo. As capas de 1:1 a ~2,1:1 continuam iguais. A página estática do case já
traz a classe e a proporção escritas no HTML, e o JS preserva esse valor até
a imagem confirmar, senão a capa pularia de 16:9 para panorâmica no load.

**O subtítulo dos projetos está vazio de propósito.** `hero.subtitlePt/En` (e o
espelho `subtitlePt/En` em `projects/index.json`, que o painel grava junto) repetia
o que o bloco de contexto já diz logo abaixo, e nos cards virava texto miúdo e
ilegível sobre a capa. O que só existia ali foi levado para os blocos de texto, e
a meta description depende de `seo.description`, que todo projeto precisa ter
preenchido (sem ela, o Worker e o `content.js` caem no subtítulo vazio). Vazio nos
dois idiomas some do layout no topo do case (`setOptionalLabel` + `[hidden]`), no
card da home e no arquivo `/work/`, que não recorre mais à categoria: ela não tem
versão em inglês e repetia as tags. O campo segue no painel e volta a aparecer
assim que receber texto.

### Prévia ao vivo

O protocolo de `postMessage` entre painel e site (`js/content.js`) confia só
na origem declarada por `?cmsOrigin=...` **ou pelo fragmento da URL**
(`#cmsOrigin=...`). O fragmento existe porque um redirect canônico do servidor
(ex.: `.html` → sem extensão) pode derrubar a query string, e sem ela o site
não reconhece o painel como remetente válido — o listener de `postMessage`
simplesmente nunca se instala. Nunca use `document.referrer` como alternativa
mais frouxa, e nunca envie com `postMessage('*')`.

## Formulário de contato

**O formulário envia de verdade, por POST, não por `mailto:`.** Ele fala com o
Worker público em `worker-contact/`, que entrega pelo Resend. A versão anterior
montava um `mailto:` e trocava `location.href`: o botão dizia "Enviar" mas o
que acontecia era o cliente de e-mail abrir com um rascunho por enviar, e quem
usa webmail no celular não via nada e ia embora achando que tinha enviado.

**Esse Worker é separado do de `worker/` de propósito.** O do painel está
inteiramente atrás do Cloudflare Access, e a verificação do JWT acontece antes
do roteamento. Abrir uma exceção de caminho lá dentro para atender visitante
significaria mexer justamente nessa barreira. O de contato não tem token do
GitHub nem acesso ao repositório: o pior caso é consumo de cota do Resend.

**O destinatário nunca vem do pedido**, só de `MAIL_TO`. Se viesse do corpo da
requisição, o endpoint seria um relay aberto e qualquer um mandaria e-mail com
este domínio no remetente.

A rota mora em `pedrodetrindade.com/api/contact`, no mesmo domínio do site,
para a chamada ser same-origin: sem CORS e sem preflight em produção. Os
cabeçalhos de CORS existem só para o desenvolvimento local (site na 5500,
Worker na 8788) e devolvem a origem, nunca `*`.

Três filtros de spam, todos baratos: armadilha invisível (`website`), tempo
mínimo de preenchimento e lista de origens. Robô detectado recebe 200 e nada é
enviado — dizer "recusado" ensinaria a contornar. Detalhes e o passo a passo do
Resend estão em `worker-contact/README.md`.

## Escrita

Sem travessões no corpo do texto. Sem caixa alta em texto corrido.
Registro premium, claro e estratégico. Evitar tom que soe gerado por IA.

## Estado atual

Home e 7 cases no ar em `pedrodetrindade.com` (GitHub Pages), com CMS
próprio publicado em `admin.pedrodetrindade.com` e formulário de contato
enviando de verdade (ver seções acima). Favicon, Open Graph e a primeira
camada de acessibilidade (skip link, foco visível, `aria-label` bilíngue,
`inert` no fundo com overlay aberto) já estão no lugar.

**Os cases são todos projetos reais, vindos do Behance (behance.net/trind9de).**
A Home tem seis destaques (`featured`, no máximo 6, o `slice` da grade no
`content-render`), em três linhas de dois, na ordem pedida por Pedro em
11/11/2026: Colégio Assertivo, LOUD dgzin, Social media, Karmine Corp,
FURIA Heat e Tenove. Os dois últimos são **"em breve"**
(`availability:"coming-soon"` no índice, select "Disponibilidade" no painel):
o card vira `<article class="home-teaser">`, sem link, com a capa esmaecida,
a 15% da saturação original (`filter:saturate(.15)` na `<img>`, pedido de
Pedro; filtro de cor em imagem parada, não blur) e "em breve" no canto, e o `content.js` manda o endereço direto do case para
`/#work`. A navegação anterior/próximo dos cases já pula os "em breve".
- **Tenove é o antigo trind9de**: só o título mudou. Slug, pasta
  (`work/trind9de/`) e imagens continuam `trind9de`, e a imagem dele segue na
  sequência da capa.
- **FURIA Heat não tem página**: só `content/projects/furia-heat.json` (no
  molde do projeto novo do painel) e a entrada no índice. Para publicar o case
  um dia, a página `work/furia-heat/index.html` precisa ser criada antes de
  trocar a disponibilidade para Publicado, senão o card leva a um 404.
AnaLu e Skye aparecem só em `/work/`, que hoje está desligado (ver "Todos os
trabalhos está desligado", abaixo): por enquanto essas páginas só abrem por
link direto.
Os slugs provisórios saíram e viraram redirecionamento: `case-02` para
`trind9de`, `case-03` para `karmine-corp` e `case-04`, que repetia a imagem do
Assertivo, para `/work/`. A navegação estática de cada página de case (anterior
e próximo, dando a volta na lista) acompanha a ordem do índice; ao incluir,
remover ou reordenar um projeto, regenere-a em todas as páginas, senão a
reserva sem JS aponta para o vizinho antigo.

O retrato do Sobre é um placeholder `.portrait`. O texto dos cases já é
conteúdo real, gerenciado pelo CMS, não mais genérico.

A seção de experiência foi removida de propósito: essa informação fica só no
LinkedIn e no currículo. **A única rede no site é o LinkedIn.** O Behance
saiu a pedido de Pedro (11/11/2026) pelo interruptor "Mostrar Behance" do
painel (`social.behanceActive:false`), com o endereço ainda gravado: religar
devolve os links. O menu do `main.js` ignorava esse interruptor e tinha o
endereço fixo como reserva; agora respeita, e nenhuma reserva (nem a do
`content-render`, usada quando o `global.json` falha) traz o Behance.

**Sob `prefers-reduced-motion` o conteúdo aparece imediatamente:** durações vão
a 0.01ms, os `.reveal` são forçados a opacidade 1 e sem deslocamento, e o JS
nem instala o scroll por inércia. Navegadores headless (inclusive o painel de
preview) reportam essa preferência por padrão, e no Windows também acontece com
"Efeitos de animação" desligado. Antes de investigar o código, confirme a
preferência.

**Aba em segundo plano trava transições de CSS a meio caminho, não só
`requestAnimationFrame`.** Ao testar uma entrada acionada por `classList.add`
(por exemplo `.reveal.in`) com `document.visibilityState === 'hidden'`, o
`getComputedStyle` pode devolver o valor inicial da transição para sempre, como
se a regra de destino nunca tivesse existido. Isso já pareceu um bug de
especificidade de CSS uma vez. Para medir o estado final sem depender da aba
estar em primeiro plano, zere a transição no elemento (`el.style.transition=
'none'`), force reflow (`el.offsetWidth`) e só então leia o computed style.

**`display:flex` num elemento pai bloca (`blockify`) o `display:inline-flex`
de um filho para `display:flex`.** É por isso que `.mail-row` (inline-flex,
pensado para centralizar via `text-align:center` do pai) precisou de
`justify-content:center` própria: o `#contact` virou flex column para
centralizar em `min-height:100svh`, e isso estica todo filho direto à largura
total do container, ignorando `text-align`. `.contact .links` já resolvia isso
do mesmo jeito; qualquer novo filho direto de uma seção com esse layout
precisa do mesmo tratamento, não de `text-align` ou `margin:auto`.

**Sangramento de ponta a ponta: veja a seção própria acima.** `html` e `body`
usam `overflow-x:clip` como rede, e é justamente por isso que um sangramento
errado não gera overflow visível e pode passar batido: confira a largura
medida, não a ausência de barra horizontal.

**O CSS só esconde os `.reveal` se `<html>` tiver a classe `js`,** que o próprio
`js/main.js` adiciona. Sem isso a página continua legível caso o JS falhe. Não
esconda conteúdo em CSS sem essa proteção.

**A regra global de `:focus-visible` não pode declarar `border-radius`.** Ela
sobrescreve o formato próprio de cada elemento e deixa pílulas retangulares só
no foco.

**O menu é dropdown por hover onde existe cursor.** O JS adiciona `.dropdown`
ao `#menu` quando `pointer:fine`, e nesse modo ele não trava a rolagem nem
deixa o fundo inerte: é painel, não modal. A carência de 170ms e a ponte
invisível `.overlay.dropdown::before` cobrem o vão entre botão e painel; sem
elas o cursor sai da região interativa no meio do caminho e o menu pisca.

**O menu central está desativado, não apagado** (pedido de Pedro):
`global.json > header.showMenu:false`, interruptor "Mostrar menu central" no
painel (ausência = ligado; religar apaga o campo). O `main.js` lê o campo em
`menuLigado`, põe `.menu-desligado` no `<html>` e marca a `.ctrl-group` como
`inert`; o clique e o hover que abriam o painel não são armados. A pílula some
por `visibility:hidden`, não por `display:none`, para continuar ocupando a
coluna do meio do grid `1fr auto 1fr` do header. A marcação do painel do menu
continua sendo injetada: religar no painel devolve tudo como era.

**`setLang` roda durante o IIFE nas páginas sem portal.** Qualquer `const`
declarada depois dele e usada dentro dele estoura na zona morta temporal e
mata o resto do script, deixando todo `.reveal` invisível. Foi o que aconteceu
com `measureCta`. Declare helpers usados por `setLang` acima dele.

**A intro não tem um segundo nome.** O `.intro-veil` cobre a página e a própria
`.hero` sobe acima dele (`body.intro-mode`), então o `.hero-name` é literalmente
o mesmo elemento nas duas etapas: nenhum crossfade entre cópias, nenhum salto.
O que muda é só a escala, via `--nscale` 1.06 -> 1 com `transform-origin:50% 50%`,
que mantém o centro fixo.

**A intro roda em toda abertura da home**, com `INTRO_MS` de 3000ms de exibição
mínima. Não há `sessionStorage`: é assinatura de entrada e Pedro quer que ela
seja vista sempre. Só `prefers-reduced-motion` pula.

**A linha do tempo da intro mora só no `js/main.js`** e desce para o CSS por
variável. Na escala 1: `--intro-reveal` 1440ms (1800 com morph), `--intro-move`
2160ms, `--intro-dur` 3600ms (3960 com morph) e `--intro-veil` 3240ms. Tudo
passa pela constante `RITMO`, hoje 4460/3960 (~1,126: Pedro pediu meio segundo
a mais), então a intro com morph dura 4460ms. O mesmo fator desce como
`--intro-ritmo`, e as durações dos secundários e do indicador no CSS são
`calc(Nms * var(--intro-ritmo,1))`. Para mudar a duração, mude só `RITMO`:
mexer só no total muda o ritmo interno, não a duração. Nenhuma duração de intro
pode ser escrita no CSS sem passar por `--intro-ritmo`.

**A etapa 1 da intro pode ser um morph** (Magic UI, morphing-text). Com
`hero.morphFrom` preenchido (campo "Palavra que vira o seu nome na intro",
hoje "Bem-vindo(a)", com `hero.morphFromEn` "Welcome" para o inglês; inglês
vazio cai no português; já foi "trind9de"), a palavra se condensa no centro, segura e se
derrete no nome: 420ms de entrada, 300 de pausa e 1080 de fusão. A etapa 2 fica
idêntica, e os secundários entram no mesmo ponto dela (`revelacao + 1350`), não
num tempo absoluto. Vazio ou ausente devolve a intro clássica intacta. O efeito
é o filtro SVG `#nome-limiar` (alfa x255 - 140, injetado pelo `main.js`) no
`.hero-name` enquanto ele tem `.limiar`; blur e opacidade das duas camadas saem
do JS quadro a quadro, com relógio por tempo e um `setTimeout` de segurança que
fecha o morph se a aba sumir. `.morfando` fica até o fim da intro: tirá-la antes
religaria a máscara e o `acende-nome` no meio da animação. O ponto final some
durante o morph e pousa depois, porque o limiar acenderia os 62% dele em 100%.

**O nome da capa é vetorial no hover** (React Bits, tech-text; substituiu o
kinetic-text, que engordava a letra). Só com cursor de verdade e sem movimento
reduzido, e só depois de `.hero-in`. O `main.js` quebra o nome em `.hn-letra`
(aria-hidden, com uma cópia `.hn-sr` para leitor de tela) e põe um canvas
(`.hn-vetor`) por cima do `.hero-name-wrap`: a letra sob o cursor esmaece no DOM
e reaparece no canvas como contorno tracejado, com moldura de seleção, alças,
medida ("T 77 × 91"), pontinhos piscando e dois pontos correndo pela borda. A
letra pode ser arrastada e volta por mola. O clique curto fazia o nome saltar
em onda e saiu a pedido de Pedro; o resto do efeito ficou. O nome continua texto no DOM porque a intro, o morph e a calibração de
8,0x dependem dele. As letras são inline com `position:relative` (o arraste é
left/top): transform não pega em inline, e inline-block perderia o kerning e
mudaria a largura calibrada. A varredura automática do original ficou de fora.

**As durações dos secundários precisam do prefixo `.js`** (`.js .h-step.hero-tag`).
Sem ele perdem para `.js .h-step`, que declara a transição inteira com
`--dur-slow`, e o escalonamento simplesmente não acontece. Os atrasos valem
porque empatam em especificidade e vêm depois, então o sintoma é sutil: a
sequência escalona, mas todas as peças duram o mesmo.

**A intro espera a página ficar visível para começar.** O `name-in`, que levanta
o nome, depende de `requestAnimationFrame`, que não dispara em aba de segundo
plano; os `setTimeout` disparam. Sem a guarda de `visibilityState`, quem abre o
site numa aba de fundo e volta depois de 2s encontra a intro já terminada, ou
pior, um véu preto parado. Se mexer na intro, mantenha essa guarda.

**O nome da hero é uma linha só, sempre.** `white-space:nowrap` e tamanho
proporcional à viewport. O texto ocupa exatamente 8,0x o `font-size` (medido,
estável depois de `document.fonts.ready`), e o `clamp(1.5rem,10.4vw,8.3rem)`
sai dessa razão com folga de ~5%. O teto existe porque `.wrap` trava em 1280px,
então acima disso a largura útil para de crescer e fica fixa em 1120px.
Mexer em `letter-spacing`, no peso ou na fonte muda a razão e exige recalibrar,
senão o nome volta a quebrar ou a estourar a lateral.

**A hero centra o nome porque só ele está no fluxo.** Tag, carimbo e "role para
explorar" são absolutos. Se algum deles voltar ao fluxo, o nome sai do centro do
viewport e a continuidade com a intro quebra.

**Tudo que começa escondido precisa da guarda `.js`.** Vale para `.intro-veil`
(`display:none` sob movimento reduzido), `.hn-line`, `.hi-line`, `.stat-line`
e `.mask-reveal`. Sem isso, se o JS falhar, o conteúdo some ou a
intro cobre o site para sempre.

**O idioma inicial é detectado, não fixo.** `detectLang()` olha
`navigator.languages` e, como segundo sinal, o fuso horário brasileiro. Escolha
explícita no seletor manda em tudo e é a única coisa gravada em `localStorage`:
gravar a detecção automática a congelaria como preferência permanente.

**Números só com dado verificável.** Nada de estimativa: o que estiver pendente
fica comentado no HTML, não publicado.

**Peso tipográfico vai até 600 no texto.** A Switzer é variável e o
`@font-face` declara o eixo de 300 a 700 (folga que o antigo hover cinético usava;
hoje nada passa de 600). `var()` não vale dentro de `@font-face`: o descritor
antigo (`var(--w-light) 500`) era descartado inteiro e o eixo ficava sem limite,
ao contrário do que o comentário dizia. Escreva números ali.

**Um grid filho de `display:flex` não estica de forma confiável no eixo
cruzado quando as colunas são em `fr`.** É o caso de `.faq-inner`: `.faq` é
`display:flex;flex-direction:column` (para centralizar o conteúdo
verticalmente via `.cms-section-surface`), e o Chrome encolhia o grid de 12
colunas para o tamanho do próprio conteúdo em vez de esticar para a largura
disponível — comprovado ao vivo, `align-items:stretch` explícito não resolve,
só `width:100%` no próprio grid. Com texto longo (PT) o conteúdo por acaso
quase preenchia a largura toda e o bug não aparecia; com texto mais curto (EN)
a caixa encolhia e centralizava, quebrando as duas colunas. Qualquer novo
grid de largura total dentro de uma seção `display:flex` precisa do mesmo
`width:100%` explícito, não só `max-width` + `margin-inline:auto`.

**O painel de preview não tem foco de documento** (`document.hasFocus()` é
`false`), então `navigator.clipboard.writeText` sempre rejeita ali com
"Document is not focused", mesmo em `localhost` (contexto seguro). Isso é
específico da automação, não do navegador de quem usa o site: não tome uma
falha de clipboard nesse painel como sinal de bug real no botão de copiar.

**O corpo dos painéis flutuantes precisa rolar por dentro.** `.overlay-sheet`
tem teto de altura e `overflow:hidden`: o que passar disso é cortado e fica
inalcançável. `.menu-list` e `.cform` já têm `overflow-y:auto`; qualquer
painel novo precisa do mesmo. Foi o que escondia o e-mail e o botão de copiar
do formulário em notebook (768px de altura), e só aparecia com zoom em 80%.

**A abertura de `#work` é o título à esquerda e um texto só à direita**,
alinhado à última linha dele e à direita, terminando na mesma borda dos
cards (`.work-intro`, grid de duas colunas a partir de 860px; no celular o
texto desce e volta a alinhar à esquerda). Eram dois textos numa faixa própria embaixo
do título (contexto e "texto lateral"); Pedro pediu um texto só, ao lado, e a
abertura perdeu essa faixa. `work.asidePt/En` saiu do `home.json`, do HTML, do
render e do painel; o texto unido mora em `work.contextPt/En` ("Texto ao lado
do título" no painel).

**Os destaques ficam na linha do grid, em 5:4** (`.work-bleed`, que manteve
o nome mas não sangra mais). Eram uma faixa de ponta a ponta da tela com
cards de 88% da altura da janela (~920x780px a 1920); Pedro pediu menores e
alinhados ao grid. Agora a grade ocupa a largura do `.wrap`, com as mesmas
margens do título e do texto da abertura (medido: 120px e 1800px a 1920,
38px a 1280, 20px no celular), e a altura sai da proporção: 828x662px a
1920 (começou em 4:3, 828x621; Pedro pediu um pouco mais altos); abaixo de
900px, uma coluna em 1:1. Os outros tamanhos de
`projects/index.json` (`cardSizes`) seguem a mesma lógica: largo e largura
completa em 21:9, grande em 16:9, alto em 4:5.

**O botão "ver todos os trabalhos" é um `.ghost-cta` comum embaixo desse
texto** (`.wi-all`) e só existe com "Todos os trabalhos" ligado. A entrada
(`.reveal`) fica no invólucro, como em `.about-actions`: no próprio `<a>`, o
`transform:none` do `.reveal.in` anularia o hover. Antes foi um pill grande no
pé da seção, com tamanho e respiros pelo painel (`ctaScale`, `ctaSpacingTop`,
`ctaSpacingBottom`), depois um botão no alto à direita do título. Os três
campos saíram do `home.json`, do painel e do `content.js`; o Worker ainda os
valida se um rascunho antigo os trouxer. Cuidado com `clampNum(null)` em
campos assim, que devolveria 0 porque `Number(null)` é 0: ausente ou `null`
precisa remover a variável.

**"Todos os trabalhos" está desligado por enquanto** (pedido de Pedro: o site
fica só com os destaques da Home). Interruptor `home.json > work.showArchive`
("Mostrar Todos os trabalhos" no painel; ausência = ligado, religar apaga o
campo; o Worker valida o tipo). Desligado:
- o botão da Home some (o HTML já nasce com `hidden`, e o `content-render`
  decide por `arquivoLigado()`, declaração de função de propósito, içada);
- `/work/` manda para `/#work` no `content.js`, antes de desenhar a página
  (sem JS a página estática continua valendo, como o resto do site);
- dentro dos cases, "Trabalhos" no breadcrumb e no rodapé aponta para
  `/#work` (`hrefDosTrabalhos()`), e o anterior/próximo gira só entre os
  `featured`: um case não leva a um projeto que não aparece em lugar nenhum.
  A navegação estática dos cases (a reserva sem JS) continua com a lista
  inteira; religar o arquivo não exige regenerá-la.
O menu do `main.js` já levava "Trabalhos" para `index.html#work`.

**O Sobre tem tom e névoa próprios, e nenhuma linha.** Pedido de Pedro: cor
levemente diferente de Trabalhos, dither suave e passagem suave entre as duas.
**"O que eu faço" tem o mesmo fundo** (pedido depois): tom e névoa não são
camadas próprias dele, são as do Sobre descendo pela seção inteira, então
entre as duas não existe emenda nenhuma.
- O tom (`.about-fundo`) é `--ink-2` a 50% sobre o que já existe, não cor
  opaca: o `.glow` fixo continua passando por baixo. Medido a 1920: Trabalhos
  rgb(23,20,20), Sobre rgb(33,27,28). A cor do painel (`--about-section-bg`)
  manda quando existe.
- As divisórias saíram pelo próprio interruptor do painel
  (`sections.about.showDividers:false`), e tom e pontos se dissolvem por
  máscara nas bordas, com a mesma curva desenhada em stops (entrada e saída
  lentas). **A entrada é longa como a dissolução da capa em Trabalhos**:
  as duas camadas sobem para o respiro vazio de Trabalhos (`--sobre-subida`,
  até 24px abaixo do último card, 146px a 1920) e só fecham ~30vh dentro do
  Sobre (`--sobre-entrada`). Antes os pontos entravam em 6rem e a borda de
  cima do dither lia como uma linha: Pedro viu e pediu a passagem da capa.
  A curva é smootherstep (6t⁵ - 15t⁴ + 10t³) em onze stops, na variável
  `--sobre-mascara`: começa e termina sem inclinação. Com cinco stops e
  quinas entre eles, a altura em que a textura acendia ainda lia como linha.
  Medido a 1920, ao lado do crachá: o brilho sobe de 21 a 41 em ~400px, sem
  degrau.
- A névoa é o `js/dither-field.js` com `{padrao:'nevoa', borracha:false}`
  e intensidade .42 (era .34; Pedro pediu o dither um pouco mais visível no
  site todo, menos no rodapé)
  (manchas lentas no lugar das ondas; o crachá já é a interação da seção),
  montada pelo `content-render` depois do `load`, quando o navegador fica
  ocioso. O host `[data-sobre-dither]` está no HTML para o `medirFundos` já
  medi-lo; `.parado` pausa o laço.
- Tom e pontos são camadas separadas (`.about-fundo` e `.about-pontos`): dentro
  da máscara do tom, os pontos do respiro de cima sumiriam junto com ele.
- **Texto pequeno em `--muted-2` nunca fica sobre a névoa.** Com 22% ou 12% de
  pontos ali, o "Capacidades" (mono pequeno) caía a 4,27:1 e 4,48:1 no
  percentil 98 do fundo, e com a névoa cheia (.42) cai a 3,47:1. Título em
  `--paper` e texto de apoio em `--muted` aguentam a névoa cheia (medidos
  10,5:1 e 5,28:1), e é por isso que o cabeçalho de "O que eu faço" pode
  ficar sobre ela. Os números dos itens (`--muted-2`) ficam só sobre o tom:
  4,67:1.
- **Três máscaras aninhadas, que se multiplicam:** `.about-pontos` (entrada e
  saída verticais), `.about-pontos-lado` (o desenho do Sobre) e `.about-dither`
  (o de "O que eu faço"). O desenho do Sobre: a partir de 640px, do lado do
  retrato, apagado antes da coluna de texto (51% da largura a partir de 900px,
  43% no tablet, medido); no celular, só nos respiros. O de "O que eu faço",
  somado a uma faixa que vale 1 até o fim do conteúdo do Sobre e 0 a 24px do
  cabeçalho de "O que eu faço" (`--sobre-troca-ini/-fim`), para a troca ser
  gradual: a partir de 1100px, a coluna da esquerda (cheia até 26%, apagada em
  41%; a lista começa em 43,7%, com o número colado na margem); abaixo disso
  a lista ocupa a largura toda, e os pontos voltam só no respiro de baixo
  (`--sobre-help-base`). Mexeu no grid do Sobre ou de "O que eu faço", remeça
  e mova os stops.
- **Tom e névoa descem por "O que eu faço" inteiro** (`--sobre-descida`, a
  altura do `#help`) e saem pela base dele, na mesma curva. As distâncias
  mudam com a tela (`#help` é 100svh centrado), então o `main.js` mede tudo em
  `medirExtensaoDoSobre()`, chamada no começo de `medirFundos()`, e publica as
  variáveis no `.about-break`. Para as camadas poderem sair da seção, o Sobre
  corta só nas laterais (`overflow-x:clip;overflow-y:visible`, dentro de
  `@supports`: sem clip, `visible` ao lado de `hidden` vira `auto` e abriria
  uma rolagem dentro da seção). `#help` vem depois no documento, então o
  conteúdo dele pinta por cima. A linha entre "O que eu faço" e o rodapé é
  anterior a isso: o rodapé tem fundo próprio, rgb(21,17,17).
- **Sem rótulos pequenos** em Sobre, "O que eu faço" e no "Contato" do rodapé,
  a pedido: `about.showKicker` e `help.showKicker` em `false`, e o rodapé ganhou
  o mesmo interruptor (`footer.showKicker`, "Mostrar chamada curta" no painel,
  já na lista de chaves do Worker). O texto continua gravado nos três.
- **O nome no título do Sobre é calibrado para caber numa linha.** Ocupa 7,74x
  o `font-size` (medido), e a coluna de texto tem ~90% da tela no celular, ~54%
  no tablet e ~46% a partir de 900px; com 5% de folga, `11vw` / `6,6vw` /
  `clamp(3.1rem,5.6vw,5rem)`. Dá 80px a 1920 (era 54) e 43 no celular (era 30).
  Mexer na fonte, no peso ou no tracking do título exige remedir.
- **Espaço entre seções em volta do Sobre (CMS, `sections.*.spacing*`).** Para
  afastar o Sobre de Trabalhos, o que cresce é `work.spacingBottom` (170 / 130
  / 120), não `about.spacingTop`: o cordão do crachá parte do topo do
  `.about-break`, e mais padding ali alongaria o cordão. Para aproximar "O que
  eu faço", o que diminui é `about.spacingBottom` (48 / 88 / 88): `#help` tem
  `min-height:100svh` com o conteúdo centrado, então o padding de cima dele só
  pesa pela metade em tela alta. Medido a 1920x889: 238px de Trabalhos ao
  Sobre (era 138) e 270px do Sobre a "O que eu faço" (era 294). Os três
  níveis vão escritos porque nível vazio herda o de cima desta mesma seção.

**As ações do Sobre são três botões na mesma linha e na mesma altura.**
"Vamos conversar" é a principal: cheia (`.cta-solid`), no material do botão
Contato do header, que faz a mesma coisa, e vem primeiro. LinkedIn e Currículo
são secundários, em contorno. O Currículo (`.cta-resume-btn`, rótulo do CMS
"Currículo"/"CV") abre para cima um menu pequeno com Português e Inglês, no
vidro do seletor de idioma (`--floating-*`): para cima porque o Sobre tem
`overflow:hidden` e os botões ficam perto da base. O menu fechado é
`visibility:hidden` (fora do Tab); Esc, clique fora e a escolha fecham, com
`aria-expanded` em dia (main.js). Histórico: eram três caixas de pesos
parecidos; depois o currículo virou linha de links discretos, e Pedro também
não gostou: pedia o mesmo peso de botão. `.ghost-cta` tem `line-height:1.25`
próprio: o LinkedIn é `<a>` e herdava o 1.6 do corpo, saindo 5px mais alto que
os `<button>` vizinhos. No celular os três empilham na largura toda. O ícone do
botão cheio precisa de especificidade maior que a regra de `.cta-primary svg`,
que o pinta de `--cream` e o apagava no branco.
`about.resumeFile` é o PDF em português e `about.resumeFileEn` o em inglês,
ambos enviáveis pelo painel. O grupo aparece quando existe ao menos um dos dois
(e `showResume` não é `false`); a opção sem arquivo continua visível, apagada e
marcada "em breve", sem `href`, para nunca virar link para 404. As bandeiras
são o mesmo SVG do seletor de idioma (`[data-flag]`, desenhado pelo `main.js`).
Cada opção abre o PDF em nova aba (`target="_blank"`), sem `download` e sem
seta, para o portfólio não ser substituído pelo arquivo.

**Quem monta um elemento é quem precisa ler o dado do CMS.** `content-render.js`
carrega antes de `js/main.js`, e é o `main.js` que injeta o `.next-hint`, o
menu, o painel de contato e o véu. Quando o render tentava escrever o texto
publicado no indicador, o elemento ainda não existia, `querySelector` devolvia
`null` e o literal do `main.js` continuava valendo: apagar o rótulo no painel
gravava `""` no JSON, publicava, e o site seguia mostrando o texto antigo.
Passou despercebido por dias porque o valor de reserva era idêntico ao
publicado. Agora o `main.js` lê `window.__CMS_HOME__.hero` ao montar, e o
`content-render.js` reaplica depois — esse segundo caminho é o que a prévia ao
vivo usa a cada tecla. Qualquer campo novo de um elemento injetado precisa dos
dois lados. Cuidado com `||` para escolher a reserva: texto vazio é uma escolha
legítima e cairia nela; teste o tipo (`typeof v === 'string'`).

**Texto do CMS dentro de `innerHTML` precisa ser escapado.** Enquanto os rótulos
do `main.js` eram literais do arquivo isso não importava. Assim que passam a vir
do painel, uma aspa no texto fecha o atributo no meio e o resto da frase vira
marcação. `content-render.js` já tinha um `esc()`; o `main.js` ganhou o mesmo.

**`[hidden]` perde para qualquer `display` declarado em componente.** O atributo
só vale pelo `display:none` da folha de estilo do usuário, que tem a menor
precedência de todas. `.next-hint` é `display:flex`, então marcar `hidden` não
escondia nada. Todo componente que possa ser desligado pelo painel precisa da
sua própria regra `[hidden]{display:none}`.

**Em `@keyframes`, o easing vale para cada trecho entre keyframes, não para a
animação inteira.** Era o defeito do blur da intro: `acende-nome` tinha três
keyframes (blur 8 → 3 → 0) com `--ease-smooth`, e cada metade ganhava a sua
própria saída rápida. O blur caía a ~3 nos primeiros 20% do primeiro trecho,
estacionava até a metade, e então um segundo arranco o levava a zero. Duas
saídas emendadas com um platô no meio leem como um blur que para e depois some
de uma vez. O arquivo já registrava a regra certa para a transformação do nome
("a interpolação é linear de propósito; um easing forte resolveria quase tudo no
começo"), mas ela não tinha sido aplicada aqui. Curva desenhada nos keyframes,
interpolação linear: a queda fica monótona e desacelera pelo espaçamento.

**A capa fica ACIMA do véu da intro** (z-index 95 contra 90), então o preto do
começo não é o véu: é o próprio fundo da capa, vazio. Isso importa porque
`.liquid-bg.has-video .lq` usava `display:none`, aplicado no instante em que o
vídeo era *anexado*, enquanto o iframe só aparece no evento `load`. Sem poster
configurado, o intervalo entre uma coisa e outra era um retângulo preto, e o
vídeo entrava por cima dele de estalo. As massas agora saem por fundido cruzado
(`.video-pronto` no `.liquid-bg`, posta junto com `.is-pronto` no iframe), no
mesmo intervalo em que o vídeo entra. Nunca volte a usar `display:none` aí.

**O fundo da capa pode ser uma sequência de imagens, no lugar do vídeo.**
`hero.projectSlideshow: true` (interruptor "Imagens no fundo da capa" no
painel) monta em `.hero-slides` as imagens de `hero.slides`, na ordem da lista,
que pode ter fotos que não são capa de projeto (a do palco está em
`assets/uploads/capa/`). Lista vazia ou ausente volta às capas de todos os
projetos visíveis, na ordem do índice. Uma imagem da lista que é capa
`coverLight` de algum projeto herda o véu a mais. Pedro tirou de propósito as
capas de Social media e AnaLu. O Worker valida cada caminho com a régua das
imagens de bloco (até 24; item vazio é ignorado, não recusado).
1,5 s cada (`SLIDE_MS`), zoom linear alternando aproxima/afasta por
passo (não pela posição, para a volta ao início não repetir o sentido), a nova
entrando por cima da anterior para a troca não escurecer. Chave própria, e não
um quinto valor de `videoMode`: o Worker só aceita os quatro modos e recusaria
a home inteira. A configuração do Vimeo continua gravada e volta ao desligar.
As capas são fundo, não destaque: véu de `--ink` a 86% por cima delas (mais
30% nas `coverLight`) e as massas marrons do vidro líquido continuam visíveis
acima a 60%, animando como antes (sem `has-video`, elas não saem). Neste modo
não há vinheta (`.lq-veil`): sobre imagens ela virava um halo escuro atrás do
nome. A legibilidade vem do fundo inteiro escuro, medida nas seis imagens no
percentil 98 do fundo: o rótulo pequeno em `--accent` ("Diretor de Arte...")
fica entre 4,83:1 e 5,28:1 com o dither atual e véu de 86% (com as `<img>`
lisas e véu de 90% era 4,59:1); a frase acima de 15:1. Clarear véu ou massas derruba o rótulo
abaixo de 4,5:1 primeiro.
A base do `.liquid-bg` se dissolve por `mask-image`, não por um véu de `--ink`
por cima: `#work` é transparente e mostra o `.glow` fixo, e um véu terminando em
`--ink` opaco deixava a base da capa mais escura que o topo da seção seguinte
(22 contra 25, medido). Era essa a "linha" na base da capa: um degrau de tom
num corte reto. O ruído da capa é
o mesmo `.cms-section-grain` do resto do site, ligado (sem
`sections.hero.grainEnabled`): textura estática repetida, sem blend nem filtro. Fora da tela ou com a aba oculta o relógio não avança;
sob movimento reduzido fica só a primeira capa, parada. `SLIDE_MS` e
`slidesTimer` precisam ficar declarados no topo do `content-render.js`, junto de
`TIPOS_DE_BLOCO`: `renderHome()` roda antes da linha onde estariam, e
`setInterval(fn, undefined)` disparou a cada poucos milissegundos.

**Fundido longo pede curva linear, não `--ease-soft`.** Medido: `.16,1,.3,1`
resolve 49% da opacidade em 10% do tempo e 75% em 20%. Num fundido de 1s isso é
um pulo de ~300ms com uma cauda invisível de 700ms — foi o que fazia o vídeo da
capa aparecer de repente. Os easings do projeto são para movimento curto de
interface; para dissolver uma camada grande, use `linear` e mais tempo
(`--hero-video-fade`, 2200ms).

**A frase de efeito da capa desce por `position/top`, nunca por margem ou
transform** (`--hero-claim-offset`, campo `hero.claimOffset`, 0-120px). Margem
mudaria a altura do `.hero-stack`, que é centrado: descer a frase 60px empurra o
nome 30px para cima junto e obriga a remedir `--nome-dy`. Transform já pertence
à entrada (`.h-step` vai de `translateY(18px)` a `none`) e seria sobrescrito
quando os secundários entram, o mesmo tropeço já registrado para o `.next-hint`.
O teto de 120px é medido: a 1280x800 sobram 141px entre o fim da frase e o topo
do indicador, e em 200px a frase passava por cima dele.

**O indicador de rolagem da capa liga e desliga pelo painel**
(`hero.showNextHint`). Ausência do campo é "ligado", só `false` desliga, e
religar apaga o campo em vez de gravar `true` — mesma convenção de `showLabel` e
`showEyebrow`. As duas linhas internas somem sozinhas quando ficam sem texto nos
dois idiomas, senão um span vazio ainda ocuparia o `gap` da coluna.

**`erroNaAparenciaDaHome` não pode ter `return` antecipado no meio.** Havia um
`if (!sections) return null` antes das regras do botão de trabalhos, então um
envio sem `sections` pulava a validação de `ctaScale` e dos dois espaçamentos
por inteiro. O painel sempre manda `sections`, por isso nunca apareceu — mas a
promessa do projeto é que quem decide é o Worker, e nesse caminho ele não
decidia. Ao acrescentar regra nova, ponha-a antes de qualquer saída antecipada
ou torne a saída condicional.

**O texto em looping do rodapé saiu, e ele estava segurando duas coisas.** A
faixa era decorativa, mas ocupava a altura do `.edge-blur` e por isso mantinha
o bloco de crédito fora do borrão — o disclaimer já tinha morado naquela faixa
antes e foi movido justamente por ficar ilegível. Removê-la devolvia o
problema. Quem protege agora é `padding-bottom:calc(var(--edge-blur-h) + ...)`,
no `.site-footer-inner` (rodapé do CMS) e no `.foot-row` (rodapé de reserva,
o que aparece sem JS — o `.edge-blur` está no HTML estático, então existe
mesmo com o JS fora). A altura do desfoque virou o token `--edge-blur-h`
para as duas medidas não andarem separadas.

**Desligar é `footer.showSignature:false` no CMS, não apagar código.** O
interruptor "Mostrar assinatura" já existia no painel, e `marqueeText` continua
gravado: religar devolve o texto. O `content-render.js` põe
`has-footer-marquee` no `<footer>` quando ele está ligado, e é essa classe que
o CSS usa para escolher entre os dois layouts. O marquee estático foi removido
das seis páginas porque era o que aparecia sem JS.

**Duas margens `auto` de frente uma para a outra não centralizam nada.** Ao
tirar o marquee, o conteúdo do rodapé ficou preso em cima com um vão morto
embaixo. `margin-bottom:auto` no grid contra o `margin-top:auto` do bloco de
crédito só reparte o mesmo vão: medido, 50px acima contra 214px abaixo, o grid
não saiu do lugar. Com `margin-block:auto` são três frações iguais (uma acima
do grid, duas abaixo) e o conteúdo passa a ocupar o centro óptico — medido,
132px de cada lado a 1280x720, com o crédito ancorado na base.

**O fundo do rodapé pode ser um dither** (Magic UI, dither-field):
`footer.background.type: "dither"`, opção "Dither (pontos animados)" no painel.
O vídeo do Vimeo continua gravado em `background.video` e volta ao trocar o
tipo. O código WebGL2 mora em `js/dither-field.js`, que o `content-render.js`
só baixa quando o gatilho do rodapé entra em cena; o endereço sai do `src` do
próprio content-render (as páginas apontam para `js/` de três jeitos), e a
versão é a constante `DITHER_V` lá dentro. Ao editar `dither-field.js`, suba
`DITHER_V` e o `?v=` do content-render nas páginas.
- Só o padrão "ondas" (Pedro trocou o horizonte por ele): cristas diagonais
  que deslizam. O original fica mais forte em cima, onde mora a headline; aqui
  o peso vertical vai para a faixa vazia entre o e-mail e a linha de baixo,
  some rente ao crédito e cai a 16% atrás do texto. Em tela vertical a base
  sobe e o topo apaga antes, porque crédito e navegação ocupam mais altura.
- Cores dos tokens, lidas do CSS: `--dither-low` (`--ink-3`), `--dither-mid`
  (`--warm-rgb`) e `--dither-high` (`--muted-2`). Já foi `--accent` e, antes,
  `--cream`: a cada volta Pedro pediu mais suave. Intensidade .26, velocidade
  .5, ponto de 2px e 60 quadros por segundo (a 30 a onda andava em degraus).
  Por cima disso, a camada inteira está a 70% de opacidade: Pedro pediu o
  dither 30% menos visível, e a opacidade baixa o contraste de cada ponto
  contra o fundo exatamente nessa medida, sem mexer no desenho.
  A crista é `pow(s, 2.5)`, mais larga que a `s^4` do original: os pontos
  acendem num gradiente longo em vez de numa faixa dura, e por cobrir mais
  área a intensidade desceu junto.
- O cursor é uma borracha (no original ele acendia os pontos): até 24 pontos de
  rastro, um a cada 12px, raio de ~46px, e o rastro se enche de novo em 1,6s.
  O rastro é gravado no próprio `pointermove`, com relógio real, e não a cada
  quadro do laço: gravado no laço, uma máquina que desenha poucos quadros
  pegava só um ou dois pontos e a borracha quase não aparecia.
- Pausa fora de alcance pelo `.parado` do `main.js` (`medirFundos` inclui
  `[data-footer-dither]` e `[data-sobre-dither]`), não por IntersectionObserver.
- O mesmo arquivo desenha a névoa do Sobre: `montar(host, opcoes)` aceita
  `padrao` ('ondas' por padrão, ou 'nevoa') e `borracha` (true por padrão).
  O rodapé chama sem opções e não muda. Sob movimento reduzido
  desenha um quadro e para. Sem WebGL2, o CSS desenha uma grade parada.
- Com rodapé dither, o `.edge-blur` vai a 0 na última altura dele de rolagem: no
  fim não há mais nada para dissolver, e ele borrava os pontos do horizonte, que
  moram justamente na faixa de baixo. A conta usa o fim real da rolagem
  (`scrollHeight`), não a base medida do rodapé, que diferia em ~10px e deixava
  o desfoque parado em 11%.
- A prévia do CMS remonta o rodapé a cada tecla: `initFooterMedia` destrói o
  dither anterior (`__CMS_FOOTER_DITHER__`) e devolve o contexto WebGL, senão o
  navegador estoura o limite de contextos vivos.

**As imagens da capa passam por um dither** (a partir do Retro Dither do
Canvas UI), em `js/dither-capa.js`, que substitui o ruído como textura da capa
(`sections.hero.grainEnabled:false`). Sem cursor nenhum, a pedido: o nome já
reage ao mouse. Vivo por conta própria, pelo zoom de cada foto e por um brilho
que deriva devagar. Quem manda na sequência continua sendo `montarSlides()`,
que publica o estado em `caixa.__estado` (ativa, saindo, início e sentido do
zoom de cada uma); o WebGL só desenha esse estado, em células de 4px e quatro
níveis de Bayer, contraste 1,28, cor 70% puxada para
`--dither-capa-escuro/-claro`, a 24 quadros por segundo. Ajustes de Pedro, em
ordem: mais lento e suave (zoom de 5%, porque os 8% da `<img>` faziam as
células ferverem; deriva a um terço da velocidade), depois a trama um pouco
mais visível (de seis para quatro níveis, contraste de 1,12 para 1,28) com as
imagens um pouco mais escuras (véu de 90% para 92%), e por fim o dither mais
visível duas vezes seguidas, pelo véu: 90% e depois 86%, que deixa passar 14%
da trama contra os 8% de antes, sem mexer no desenho. O canvas
fica entre as `<img>` e o véu, e as `<img>` só somem depois do fundido
de entrada. Medido nas seis imagens, exatamente na caixa do rótulo da capa
(texto escondido, p98 do fundo): de 4,93:1 a 5,39:1 com véu de 90% e de
4,83:1 a 5,28:1 com os 86% atuais. Quem pesa mais nessa conta são as massas
marrons por cima do véu, não as imagens. Cuidado ao medir pelo
`computer zoom` do Chrome: a região é em coordenadas do quadro da captura
(1568 de largura numa janela de 1920), não em px de CSS; converta.
Texturas reduzidas a 1280px (seis fotos de 2000px com mipmap passariam de
80MB de vídeo). Versão em `DITHER_CAPA_V`, no content-render.
O trind9de entra na capa e como capa de listagem (card da home e `/work/`) por
`capa-ceu-zoom.webp`, um recorte de 1,7× em volta do símbolo 3D, que na foto
inteira ficava pequeno demais; o `og:image` do case segue com a foto inteira.

**Sem ruído na capa, a emenda com #work precisa do ruído na faixa de
dissolução.** A máscara do `.liquid-bg` só fecha a conta se as duas seções
tiverem a mesma textura na borda: sem ruído na capa, a base dela acabava lisa
e #work começava com ruído a 10% por cima, e o degrau voltava, mais escuro em
cima. `.hero::after` desenha o ruído só nessa faixa, com a máscara
complementar à do `.liquid-bg`, e só quando a capa não tem ruído próprio e
#work tem. Pedro gosta muito dessa emenda: confira a passagem ao mexer em
qualquer camada da capa.

**A assinatura do rodapé está desligada** (`footer.showHandSignature:false`, a
pedido): o código e o desenho ficam, e o interruptor do painel a religa.
A assinatura (Spell UI, signature) se escreve apoiada na linha
fina acima do crédito, na cor do nome da capa. Contornos gerados uma vez da
Herr Von Muellerhoff (OFL) com opentype.js, fora do site: `js/assinatura.js`
traz só os 15 caminhos prontos, e o texto é fixo. Contorno fino e um traço
grosso dentro de máscara revelando o preenchimento, por `stroke-dashoffset`
com `pathLength=1`: 110ms entre letras, `--dur-slow` cada, linear (com
`--ease-smooth` a letra saía 96% desenhada na primeira metade). Disparo pelo
`.in` do sistema de entradas; como ela fica a ~80% da altura da tela com a
página no fim, quem a revela é a regra de fim de página, e ela se escreve
quando a pessoa chega lá. `footer.showHandSignature:false` desliga (o Worker
conhece a chave). Versão em `ASSINATURA_V`, no content-render.

**Breadcrumb nas páginas de case e em `/work/`** (BoardUI, navegação
estrutural): Início › Trabalhos › projeto. Montado pelo `content-render`
(`aplicarBreadcrumb`) no topo do `.case-hero` e da `.work-archive-intro`, e não
escrito nas páginas, para valer também nos cases que o painel gera do zero; o
último nível sai do título do hero e acompanha o CMS. Links com pílula suave no
hover, página atual em `--paper` com `aria-current`, rótulo do `nav` bilíngue.

**A foto do Sobre é um crachá** (React Bits, lanyard), em `js/cracha.js`,
carregado pelo `content-render` sem movimento reduzido e a partir de 640px (no
celular a foto fica no meio do texto). O original é 3D com three.js e física;
aqui é 2,5D sem biblioteca. Visual de crachá como na referência: cartão claro
(`--paper`, é um objeto, não uma seção), fenda e presilha metálica no alto,
foto quadrada encaixada, nome e cargo embaixo. Cordão em SVG com o nome em
mono, **saindo de trás do card de Trabalhos logo acima** (pedido de Pedro; antes
saía do topo da seção). `#work` tem `z-index:1` e pinta acima do Sobre, e a
âncora fica 16px acima da borda de baixo do card (`ESCONDIDO`), atrás dele.
A borda é a da caixa de layout (soma de `offsetTop`, em `medirAncora()`),
que ignora o transform de entrada do card. Duas tentativas que não
funcionaram: começar rente à borda pelo `getBoundingClientRect` deixava o
topo do cordão ~20px abaixo do card enquanto ele entrava, com um pulo no fim
da entrada; e sem observar Sobre e Trabalhos (`ResizeObserver`), a âncora
envelhecia quando a janela mudava de altura (o respiro do Sobre é em vh), e o
cordão passava 5,6px por cima do card. Sem card na mesma vertical, volta ao
topo da seção.
**Cordão e crachá já existem quando a rolagem chega neles:** o fundido começa
na montagem, e não mais no `.in` da foto. Esperando a entrada da foto, o
cordão surgia do nada no meio da descida (Pedro achou estranho).
Presilha de 36px e fita de 30px (eram 24 e 14, finos; 48 e 42, grossos),
contra a fenda de 54px. A presilha tem 34px de altura e desce 4px para
dentro da fenda, para ler presa nela. Sem "trind9de" em lugar nenhum do crachá, a pedido.
**Sem interação nenhuma, só respiro** (pedido de Pedro, depois de ter sido
arrastável e de virar com clique): o verso saiu junto com a virada, e sem
arraste ele deixou de exigir mouse, então tablet de toque também recebe. O
alvo da mola da presilha oscila em volta da posição de layout, 2,4px para os
lados em 7s e 1,2px para cima e para baixo em 4,6s, com giro em Y de ~1,7 grau
em 9,4s; os períodos não se dividem, para o desenho não se repetir à vista. A
amplitude entra em 2,5s. Medido: no máximo 2,3px, 1,1px e 0,7 grau de giro no
plano. **O giro no plano vem do cordão inteiro (âncora até a presilha), com
piso de 180px no comprimento**: medido nos últimos quatro trechos, como era no
arraste, o cordão curto do Sobre transformava 2px de respiro em 8 a 10 graus.
A presilha anda por uma mola amortecida no crítico (`W_CASA` 6). **O cordão é
uma linha reta da âncora à presilha, não mais uma corda de verlet**: com o
respiro de 2px, os pontos do meio faziam ondas em S que a curva suave
transformava numa dobra da fita logo acima da presilha (Pedro viu o cordão
"bugado"). Pendurado pelo peso, o cordão fica esticado; reto é o certo. **O
caminho do cordão é escrito uma vez, em repouso, e o respiro chega por
transform no `<svg>`** (giro em volta da âncora e escala só no comprimento,
com `translate3d` para ir à GPU). Reescrever o `d` a cada quadro refazia o
layout do SVG e do texto do cordão 60 vezes por segundo: era a maior parte do
trabalho da página parada no trace. O laço dorme com a aba oculta e longe do
crachá, pelo `.parado` que o `main.js` põe na própria `.about-photo` (antes
era o da névoa, que agora desce até o fim de "O que eu faço" e mantinha o
laço rodando no rodapé); o tempo do respiro só anda com o laço acordado.
Entra por fundido da figura inteira, parado no lugar, logo na montagem. A máscara de baixo para
cima das outras imagens fica desligada aqui: num objeto pendurado ela lia como
se o crachá carregasse de cabeça para baixo ao chegar na seção.
`casa` vem de `offsetLeft/offsetTop` do cartão (caixa de layout): o
`getBoundingClientRect` devolveria a caixa do cartão girado. A foto é
`assets/uploads/sobre/retrato-2026.webp`, quadrada. Versão em `CRACHA_V`.
O crosshair do React Bits chegou a entrar e saiu a pedido: não volte com ele
sem perguntar.

**O cursor é o do sistema.** O Target Cursor do React Bits entrou (preset
"Calm", em js/cursor-alvo.js, como terceiro modo do CMS) e saiu a pedido de
Pedro no mesmo dia, inteiro: arquivo, CSS, ligação no main.js, opção do
painel e o modo no Worker. Um Smooth Cursor do Magic UI chegou a ser pedido
no lugar e foi cancelado antes de entrar. Como o crosshair, não volte com
nenhum dos dois sem perguntar. O modo "bola + glow" (effects.cursor.mode
'orb') continua disponível no painel, desligado.

**A foto do Sobre tem bloqueio contra abrir em outra aba e baixar** (pedido
de Pedro), em três camadas: `.portrait-img` sem `pointer-events` (o clique cai
no `.portrait`, uma div, então o navegador não oferece "abrir imagem em nova
aba", "salvar imagem como" nem pesquisa por imagem), `draggable="false"` com
`-webkit-user-drag:none`, e `-webkit-touch-callout:none` contra o "Salvar em
Fotos" do toque longo no iPhone. O `main.js` ainda cancela `contextmenu` e
`dragstart` em toda a `.about-photo`, delegado no documento porque o crachá
move o retrato para dentro do cartão. O clique direito no resto da página
continua normal. Não impede captura de tela nem quem abre as ferramentas do
desenvolvedor (o arquivo é público em `assets/`); nenhum site consegue.

**"O que eu faço" absorveu as Capacidades do Sobre.** As oito capacidades
repetiam os títulos da seção; viraram as tags dos itens, cada uma aparecendo
uma vez só, e saíram do Sobre, do `home.json` (`about.capabilities` e os
rótulos), do `content-render`, do `main.js`, do CSS e do painel. O texto foi
reescrito a partir do currículo (`assets/uploads/curriculo/`) e do LinkedIn,
porque o anterior dizia que ele fazia de tudo sem dizer o quê: cada item nomeia
entregas reais (rebranding do grupo com mais de cinco frentes, brand guideline
e base de design system, estandes e aftermovies, site com formulário no CRM,
criativos de tráfego pago, agentes ligados a templates). São seis itens, e o
HTML estático da lista é gerado do mesmo molde do `content-render`.
- Fora do texto de propósito: o número de países. O currículo diz "mais de 200"
  e o LinkedIn "mais de 120"; com dois valores, nenhum é verificável.
- O item de sites diz que este portfólio e o painel foram feitos com apoio de
  IA. É verdade, mas é uma escolha de posicionamento de Pedro: se ele preferir
  não dizer, é só a última frase do item 05.
- Sem as Capacidades, a coluna de texto do Sobre ficou mais baixa que o crachá
  e o grid repartia a sobra entre as três linhas, abrindo um vão entre título e
  texto. `grid-template-rows:auto auto 1fr` manda a sobra para baixo das ações.

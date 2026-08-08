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
(secundário), `--muted-2` #8A7E7E, `--accent` #A29595, `--cream` #C9BDBD.

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
`backdrop-filter` continua permitido no vidro fosco da UI flutuante.

**Um único listener de scroll**, passivo e com throttle por rAF, alimenta
header e scrub. Não adicione outro: some no
laço existente em `js/main.js`.

O scroll por inércia é próprio, sem biblioteca, com decaimento por tempo
(lerp .18, roda a 1). Intercepta só a roda do mouse. Toque, teclado, âncoras
e barra de rolagem seguem nativos.

**Abrir com `?nosmooth=1` desliga a inércia** e devolve a rolagem nativa. É a
chave de comparação para separar custo de pintura de custo de dirigir o scroll
por JS. O painel de preview do Codex não reproduz nenhum dos dois: ele
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

Home e 4 páginas de case no ar em `pedrodetrindade.com` (GitHub Pages), com CMS
próprio publicado em `admin.pedrodetrindade.com` e formulário de contato
enviando de verdade (ver seções acima). Favicon, Open Graph e a primeira
camada de acessibilidade (skip link, foco visível, `aria-label` bilíngue,
`inert` no fundo com overlay aberto) já estão no lugar.

**Imagens de galeria dos cases ainda faltam** (`galeria-1.jpg`/`galeria-2.jpg`
em `assets/projetos/case-0*/`, o `case-03` sem nenhuma). Sem o arquivo, o
`onerror="this.remove()"` tira só a `<img>` e deixa o gradiente decorativo do
`.scene`/`.thumb` visível — não quebra a página, não gera ícone de erro, mas
também não mostra imagem nenhuma do trabalho ali. Capas (`cover` nos quatro
projetos) já estão preenchidas.

O retrato do Sobre é um placeholder `.portrait`. O texto dos cases já é
conteúdo real, gerenciado pelo CMS, não mais genérico.

A seção de experiência foi removida de propósito: essa informação fica só no
LinkedIn e no currículo. Redes sociais são apenas LinkedIn e Behance.

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
variável: `--intro-reveal` 1200ms, `--intro-move` 1800ms, `--intro-dur` 3000ms
e `--intro-veil` 2700ms. Nenhuma duração de intro pode ser escrita direto no
CSS. Ao mudar o total, escale tudo pelo mesmo fator, inclusive
`SECUNDARIOS_MS`, a saída do véu e as durações de `.hero-tag`, `.hero-when`,
`.hero-claim` e do indicador: mexer só no total muda o ritmo interno, não a
duração.

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
(`display:none` sob movimento reduzido), `.hn-line`, `.hi-line`, `.stat-line`,
`.caps-grid li` e `.mask-reveal`. Sem isso, se o JS falhar, o conteúdo some ou a
intro cobre o site para sempre.

**O idioma inicial é detectado, não fixo.** `detectLang()` olha
`navigator.languages` e, como segundo sinal, o fuso horário brasileiro. Escolha
explícita no seletor manda em tudo e é a única coisa gravada em `localStorage`:
gravar a detecção automática a congelaria como preferência permanente.

**Números só com dado verificável.** Nada de estimativa: o que estiver pendente
fica comentado no HTML, não publicado.

**Peso tipográfico vai até 600.** A fonte só carrega 300/400/500/600, então
qualquer 700 vira falso-negrito.

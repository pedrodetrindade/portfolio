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

**O indicador "continue" da hero (`.next-hint`) é sempre centralizado por
`left:50% + translateX(-50%)`.** Qualquer regra que troque o `transform` dele
(a entrada disparada pela intro, por exemplo) precisa manter o
`translateX(-50%)` e mexer só no eixo Y, senão o botão perde a centralização
e ainda "desliza" de lado ao entrar. Já aconteceu: a transição de
`intro-mode` para `hero-sec` sobrescrevia o transform inteiro para
`translateX(10px)` → `none`, produzindo um botão torto com uma animação
lateral indesejada em vez de só opacidade e um leve movimento vertical.

**O header não tem fundo próprio.** Marca, pílula de Menu/Disponibilidade e
seletor de idioma não têm contraste garantido contra o que rola por baixo do
header fixo (uma capa de projeto clara, o retrato do Sobre): sem alguma
proteção o contraste virava loteria dependendo da seção. A primeira tentativa
foi uma vinheta de largura cheia (`header::before`, gradiente escuro fixo no
topo, sem blur). Funcionava, mas pintava uma faixa visível mesmo sobre o
fundo escuro padrão do site, lendo como uma sombra que não deveria estar ali.
Foi trocada por `filter:drop-shadow(...)` direto em `.brand`, `.menu-btn`,
`.avail` e `.lp-toggle`. `filter` e não `text-shadow` porque também precisa
cobrir os ícones SVG (seta do idioma, ponto do Menu), e `text-shadow` não
pinta forma vetorial. Sem retângulo pintado: invisível sobre o próprio fundo
escuro do site, só aparece (como halo escuro em volta da letra) quando o
fundo por trás realmente precisa. Passou por duas calibragens: a primeira
empilhava dois drop-shadow, um deles com 7px de raio e opacidade .55, forte e
espalhada demais, visível até onde não precisava; a segunda, um só
drop-shadow com opacidade .4, ficou fraca demais e voltou a perder a letra
sobre um fundo bem claro. Raio curto (2px, sem segunda camada) com opacidade
média (.6) é o meio-termo: imperceptível sobre o fundo escuro padrão do site,
mas ainda segura a borda da letra sobre um fundo muito claro.
`.avail` ("Disponível para projetos") também perdeu o
`color:var(--muted-2)` com `opacity:.82`: combinar uma cor já baixa com uma
opacidade extra por cima não sobrava contraste sobre fundo muito claro, nem
com o drop-shadow. Passou para `--muted` sem opacity extra, que ainda lê mais
quieto que o Menu (esse em `--paper`, peso Medium).

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

## Escrita

Sem travessões no corpo do texto. Sem caixa alta em texto corrido.
Registro premium, claro e estratégico. Evitar tom que soe gerado por IA.

## Estado atual

Home e 4 páginas de case prontas e funcionando. Favicon, Open Graph e a primeira
camada de acessibilidade (skip link, foco visível, `aria-label` bilíngue, `inert`
no fundo com overlay aberto) já estão no lugar.

O que ainda falta está listado em "Próximos passos" no brief: imagens reais dos
projetos e do retrato, conteúdo real dos cases, deploy e performance.

As prévias dos projetos são placeholders em gradiente (`<div class="scene pX">`),
o retrato do Sobre é um placeholder `.portrait`, e o texto dos cases é genérico,
ainda não é o conteúdo real dos trabalhos.

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

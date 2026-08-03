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
(lerp .115, roda a .9). Intercepta só a roda do mouse. Toque, teclado, âncoras
e barra de rolagem seguem nativos.

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

**`100vw` inclui a barra de rolagem.** Elementos que sangram de ponta a ponta
precisam de `calc(100vw - var(--sbw))`, com `--sbw` medido pelo JS. Ignorar isso
gera overflow horizontal e deixa a faixa curta à direita. `html` e `body` usam
`overflow-x:clip` como rede.

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
que mantém o centro fixo. Roda uma vez por sessão via `sessionStorage`.

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

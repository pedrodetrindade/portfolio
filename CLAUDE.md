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
`--dur-fast` 500ms, `--dur-default` 700ms, `--dur-slow` 950ms, `--dur-ambient`
1400ms. `--ease-out-smooth` e `--ease-out-expo` continuam como aliases legados.
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
header, inversão sobre a faixa clara e scrub. Não adicione outro: some no
laço existente em `js/main.js`.

O scroll por inércia é próprio, sem biblioteca, com decaimento por tempo
(lerp .135, roda a .9). Intercepta só a roda do mouse. Toque, teclado, âncoras
e barra de rolagem seguem nativos.

## Direção visual

Fundo carvão-azulado dessaturado, baixo contraste, elegante e maduro.
Texturas-assinatura: orbes de luz difusas, grain, vidro fosco.
Sobreposições (selos, botões flutuantes, tags) sempre translúcidas, nunca creme sólido.
Tipografia: Onest para display e corpo, JetBrains Mono para rótulos técnicos,
sempre em minúsculas.

Animações precisam respeitar `prefers-reduced-motion` e desligar em telas touch
quando dependem de cursor.

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

**O header é de vidro claro e some sobre a faixa clara do Sobre.** O JS alterna a
classe `on-light` no `header` durante a rolagem. Qualquer elemento novo no topo
precisa de uma variante `header.on-light`.

**Nunca dê `focus()` num dos botões de idioma ao carregar.** O foco vai no
`#gate`, que tem `tabindex="-1"`. Focar o primeiro botão pintava nele o anel de
`:focus-visible` e o fazia parecer pré-selecionado. Pela mesma razão, a regra
global de `:focus-visible` não pode declarar `border-radius`: ela sobrescrevia o
formato pílula dos botões e os deixava retangulares só no foco.

**O menu é dropdown por hover onde existe cursor.** O JS adiciona `.dropdown`
ao `#menu` quando `pointer:fine`, e nesse modo ele não trava a rolagem nem
deixa o fundo inerte: é painel, não modal. A carência de 170ms e a ponte
invisível `.overlay.dropdown::before` cobrem o vão entre botão e painel; sem
elas o cursor sai da região interativa no meio do caminho e o menu pisca.

**`setLang` roda durante o IIFE nas páginas sem portal.** Qualquer `const`
declarada depois dele e usada dentro dele estoura na zona morta temporal e
mata o resto do script, deixando todo `.reveal` invisível. Foi o que aconteceu
com `measureCta`. Declare helpers usados por `setLang` acima dele.

**A intro sai em cascata e é removida do DOM.** `#gate.in` escalona a entrada,
`#gate.leaving` escalona a saída na ordem inversa, e o `#gate` é removido depois
de 1100ms para as massas de luz pararem de animar. Elementos novos na intro
precisam da classe `.g-step` para entrar no escalonamento.

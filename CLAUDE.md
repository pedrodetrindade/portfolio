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

Home e 4 páginas de case prontas e funcionando. O que ainda falta está listado em
"Próximos passos" no brief: imagens reais dos projetos, conteúdo real dos cases,
deploy e acabamento (favicon, Open Graph, acessibilidade).

As prévias dos projetos são placeholders em gradiente (`<div class="scene pX">`) e
o texto dos cases é genérico, ainda não é o conteúdo real dos trabalhos.

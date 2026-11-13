# Portfólio Pedro de Trindade

Brief do projeto: o que o site é, o que existe nele hoje e o que ainda falta.
As regras técnicas (convenções que quebram o site, medidas, decisões tomadas
com Pedro e o motivo de cada uma) moram no `CLAUDE.md`. Este arquivo não as
repete, para os dois não andarem separados.

Estado conferido no código em 13/11/2026.

## Objetivo
Portfólio pessoal codado, no ar em pedrodetrindade.com. Posicionamento: diretor
de arte e designer sênior, com foco em direção criativa, branding, identidade
visual, campanhas e estratégia de marca para fintech, ativos digitais e
negócios B2B e B2C.

## Identidade
- Nome público: Pedro de Trindade
- Handle: @pedrodetrindade
- Domínio: pedrodetrindade.com
- E-mail público: contact@pedrodetrindade.com (e contato@, os dois encaminham
  para o Gmail)
- Única rede no site: LinkedIn. O Behance está desligado pelo painel, com o
  endereço guardado; religar devolve os links.

## Stack e hospedagem
- HTML, CSS e JS puro, sem framework e sem build. GitHub Pages a partir da
  branch `main` de github.com/pedrodetrindade/portfolio, com `CNAME` na raiz.
- Conteúdo em `content/*.json`, editado pelo CMS próprio em
  admin.pedrodetrindade.com (Cloudflare Worker em `worker/`, atrás do
  Cloudflare Access). Cada publicação vira um commit em `main`. Desenho
  completo em `CMS-README.md`.
- Formulário de contato: Worker público em `worker-contact/`, na rota
  pedrodetrindade.com/api/contact, com entrega pelo Resend. Passo a passo em
  `worker-contact/README.md`.
- Fonte única: Switzer variável (`assets/fonts/Switzer-Variable.woff2`). Os
  rótulos usam a mesma família (`--mono` aponta para ela).

## Mapa de arquivos
```
index.html                    Home
work/<slug>/index.html        páginas de case (sete)
work/index.html               "Todos os trabalhos", hoje desligado (vai para /#work)
work/case-0*, work/colegio-assertivo.html
                              redirecionamentos de endereços antigos
css/style.css                 todo o CSS
js/content.js                 lê os JSON no <head> e cuida da prévia do CMS
js/content-render.js          desenha Home, cases, rodapé e breadcrumb a partir dos JSON
js/main.js                    rolagem suave, entradas, intro, header e painel de contato
js/dither-capa.js             dither WebGL das imagens da capa
js/dither-field.js            campo de pontos WebGL: rodapé, névoa e ondas do Sobre
js/cracha.js                  crachá do Sobre
js/assinatura.js              assinatura manuscrita do rodapé (hoje desligada)
js/work-nav.js                ajuste do menu nas páginas de /work/
content/global.json           header, menu, redes e efeitos
content/home.json             textos e aparência da Home
content/projects/index.json   ordem, destaques, disponibilidade e capas dos projetos
content/projects/<slug>.json  corpo de cada case, em blocos
assets/uploads/               imagens e PDFs enviados pelo painel
worker/, worker-contact/      os dois Workers da Cloudflare
```

## Direção visual
Escura, monocromática, levemente quente e puxada para marrom. Clean,
editorial, baixo contraste, peso tipográfico até 600 e tracking baixo. A
separação entre seções vem de tom, textura e ritmo vertical, não de linhas
nem de fundo claro. A textura do site é de pontos (dither) e ruído discreto,
sem `filter:blur()`. Tokens de cor, tipografia e movimento: `:root` em
`css/style.css`, com as regras de uso no `CLAUDE.md`.

## A Home hoje, de cima para baixo
1. **Intro.** "Bem-vindo(a)" ("Welcome" em inglês) se condensa e derrete no
   nome. Roda em toda abertura; só o movimento reduzido pula.
2. **Capa.** O nome numa linha só, no centro, com cargo, "Baseado no Rio de
   Janeiro, Brasil", o relógio do Brasil e a frase de efeito. Fundo: as capas
   dos projetos em sequência, passando por um dither, sob um véu escuro e as
   massas marrons do vidro líquido. Com cursor, a letra sob ele vira contorno
   vetorial, com medida e alças, e pode ser arrastada.
3. **Trabalhos.** Título à esquerda, um texto à direita e seis destaques em
   três linhas de dois, em 5:4: Colégio Assertivo, Social media, LOUD dgzin,
   Karmine Corp, FURIA Heat e Tenove. Os dois últimos estão "em breve": sem
   link e com a capa a 15% da saturação.
4. **Sobre.** Crachá com a foto, pendurado por um cordão que sai de trás do
   card acima; título com o nome, texto e três botões (Vamos conversar,
   LinkedIn e Currículo, com PDF em português e em inglês). Tom e névoa de
   pontos próprios, que descem até a seção seguinte.
5. **O que eu faço.** Seis frentes numeradas, escritas a partir do currículo e
   do LinkedIn, cada uma com as suas tags (as antigas Capacidades do Sobre). A
   partir de 1100px, um painel de ondas em dither ocupa o vão à esquerda.
6. **Rodapé, que é também o contato.** Uma tela inteira com headline, e-mail
   copiável, navegação e LinkedIn sobre um fundo de pontos em ondas, que o
   cursor apaga ao passar.

No topo: a marca à esquerda; idioma e "Contato" à direita. O menu central está
desligado pelo painel. "Contato" abre o painel com o formulário (nome, e-mail e
mensagem).

Fora da página por escolha: o FAQ existe no HTML e no painel, desligado. As
seções de experiência, ferramentas e números saíram; experiência fica no
LinkedIn e no currículo.

## Cases
Todos são projetos reais, vindos do Behance (behance.net/trind9de). O corpo de
cada case é uma lista de blocos (texto, imagem, galeria, citação e vídeo)
editada no painel. Cada página tem breadcrumb e navegação anterior e próximo,
que gira só entre os destaques enquanto "Todos os trabalhos" estiver desligado.

| Projeto            | Página                       | Situação                                         |
|--------------------|------------------------------|--------------------------------------------------|
| Colégio Assertivo  | `/work/colegio-assertivo/`   | publicado, destaque                              |
| Social media       | `/work/social-media/`        | publicado, destaque                              |
| LOUD dgzin         | `/work/dgzin/`               | publicado, destaque                              |
| Karmine Corp       | `/work/karmine-corp/`        | publicado, destaque                              |
| FURIA Heat         | nenhuma ainda                | em breve, destaque                               |
| Tenove             | `/work/trind9de/`            | em breve, destaque; a página existe, mas leva a `/#work` |
| AnaLu              | `/work/analu/`               | publicado, só por link direto                    |
| Skye               | `/work/skye/`                | publicado, só por link direto                    |

Tenove é o antigo trind9de: só o título mudou, slug e pastas continuam
`trind9de`.

## O que falta
1. **FURIA Heat.** Criar `work/furia-heat/index.html` no molde das outras
   páginas e montar o corpo do case no painel. Só depois trocar a
   disponibilidade para Publicado, senão o card leva a um 404.
2. **Tenove.** A página existe. Falta revisar o case e trocar a
   disponibilidade para Publicado no painel.
3. **Imagens pesadas**, bem acima do padrão das outras: foto-time do Karmine
   (584KB), capa do Karmine (490KB), capa-case-cordao do dgzin (448KB), capa
   de listagem do Social media (414KB), capa-cordao (380KB) e camisa-loud
   (375KB) do dgzin. Recomprimir muda pixels, então a decisão é de Pedro, com
   antes e depois lado a lado. `assets/uploads/sobre/prancheta-1.webp`
   (528KB) não é usada em lugar nenhum.
4. **Textos que dependem de Pedro.** O número de países alcançados (o
   currículo diz mais de 200, o LinkedIn mais de 120; fica fora do site até
   haver um número só) e a frase sobre o uso de IA no item 05 de "O que eu
   faço", que é escolha de posicionamento.
5. **"Todos os trabalhos" desligado.** AnaLu e Skye só abrem por link direto.
   Religar é um interruptor no painel.
6. **Limpeza de código possível.** A antiga seção `#contact` foi absorvida pelo
   rodapé do CMS e virou uma âncora de 1px dentro dele, mas o `main.js` ainda
   mede o rodapé para ela (`--footer-block-height`) e o CSS ainda tem regras de
   `#contact`, que hoje caem nessa âncora. Sem efeito visível, mas é código
   que sobrou.

## Preferências de escrita
Sem travessões no corpo do texto. Sem caixa alta em texto corrido. Registro
premium, claro e estratégico. Evitar tom que soe gerado por IA. Números só com
dado verificável: o que estiver pendente fica fora do site, não estimado.

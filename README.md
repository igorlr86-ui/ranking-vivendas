# Ranking Vivendas da Mata

Ranking individual de beach tennis do Vivendas da Mata: grupos da semana, lançamento de placares com confirmação do adversário, classificação e sorteio verificável.

**Página:** https://igorlr86-ui.github.io/ranking-vivendas/

## Como funciona

- **Rodadas:** cada rodada dura 2 semanas (aba *Config* da planilha: `semanas_por_rodada`). Começa na segunda às 14h e o prazo vai até o domingo às 20h da última semana.
- **Sorteio:** na segunda-feira às 14h do início de cada rodada (Brasília), a rede pública [drand](https://drand.love) (League of Entropy, rede *quicknet*) divulga um número aleatório assinado. Os grupos da rodada saem desse número, com uma conta que qualquer pessoa pode refazer na aba **Sorteio** da página. Ninguém da organização escolhe nem consegue prever o resultado.
- **Formato:** Feminino e Masculino em grupos de 4, com 3 jogos trocando as duplas; Mista em grupos de 2 homens + 2 mulheres, com 2 jogos. Os jogos do grupo podem ser feitos em qualquer ordem.
- **Sem repetir:** a partir da rodada de 02/11/2026, o sorteio evita colocar no mesmo grupo quem já jogou junto na mesma categoria. Quando isso deixar de ser possível, escolhe a combinação com menos repetições. Na Mista, quem folgou menos vezes tem a vez de folgar.
- **Horários e agendamento:** cada jogador marca os horários livres da rodada, separados para Feminino/Masculino e para Mista; o grupo vê quando os quatro podem. Qualquer um do grupo marca o dia e a hora do jogo, e os quatro recebem e-mail com convite de agenda (.ics), enviado pela conta Google dona da planilha (rode `autorizarEmail` uma vez no Apps Script).
- **Acesso:** no primeiro acesso cada jogador cria o próprio código de 4 números e cadastra o e-mail. Se alguém criar no nome de outra pessoa, a organização apaga o código na planilha e a pessoa cria de novo.
- **Placar:** quem ganhou lança; um dos que perderam confirma (ou contesta). Só conta jogo confirmado. Se ninguém confirmar até domingo às 20h, vale o placar lançado (regra configurável na aba *Config* da planilha: `sem_validacao` = `aceitar` ou `pendente`).
- **Grupos incluídos depois do sorteio:** quando entra alguém no meio de uma rodada, a organização pode montar um grupo extra com quem estava de folga (fica em `GRUPOS_EXTRAS`, no programa da planilha, e aparece com aviso na página). A conferência do sorteio continua valendo para os grupos sorteados, e o grupo extra entra no histórico dos próximos sorteios.
- **Coringa:** num jogo em que alguém faltou, qualquer um dos que jogaram marca quem faltou e quem jogou de coringa. Quem faltou fica com W.O. (0 ponto) e o coringa não pontua.
- **Pontos:** vitória 10, derrota 5, participação 2, +1 por game ganho. Desempate: vitórias, games ganhos, saldo de games, jogos disputados.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html`, `app.js` | A página (GitHub Pages). |
| `sorteio.js` | A conta do sorteio. É o mesmo código na página e na planilha. |
| `config.js` | Endereço do programa da planilha. |
| `apps-script/Codigo.gs` | Programa que roda na planilha do Google (gerado por `apps-script/build.py`). |
| `apps-script/backend.js` | Fonte do programa da planilha. |

Os códigos pessoais dos jogadores ficam **só** na planilha do Google da organização. Nada neste repositório é segredo.

## Instalação do programa na planilha (uma vez)

1. Abra a planilha **Ranking Vivendas · Códigos pessoais** no Google Drive.
2. Menu **Extensões › Apps Script**.
3. Apague o conteúdo de `Código.gs` e cole o conteúdo de [`apps-script/Codigo.gs`](apps-script/Codigo.gs). Salve.
4. No seletor de funções no topo, escolha **setup** e clique em **Executar**. Autorize o acesso quando o Google pedir.
5. Clique em **Implantar › Nova implantação**. Tipo: **App da Web**. *Executar como:* **Eu**. *Quem pode acessar:* **Qualquer pessoa**. Clique em **Implantar** e copie o endereço que termina em `/exec`.
6. Coloque esse endereço em `config.js`.

Para atualizar o programa depois: cole o novo `Codigo.gs`, salve e use **Implantar › Gerenciar implantações › Editar › Nova versão**, mantendo o mesmo endereço.

# Ranking Vivendas da Mata

Ranking individual de beach tennis do Vivendas da Mata: grupos da semana, lançamento de placares com confirmação do adversário, classificação e sorteio verificável.

**Página:** https://igorlr86-ui.github.io/ranking-vivendas/

## Como funciona

- **Sorteio:** toda segunda-feira às 14h (Brasília), a rede pública [drand](https://drand.love) (League of Entropy, rede *quicknet*) divulga um número aleatório assinado. Os grupos da semana saem desse número, com uma conta que qualquer pessoa pode refazer na aba **Sorteio** da página. Ninguém da organização escolhe nem consegue prever o resultado.
- **Formato:** Feminino e Masculino em grupos de 4, com 3 jogos trocando as duplas; Mista em grupos de 2 homens + 2 mulheres, com 2 jogos. Os jogos do grupo podem ser feitos em qualquer ordem.
- **Sem repetir:** a partir da semana de 26/10/2026, o sorteio evita colocar no mesmo grupo quem já jogou junto na mesma categoria. Quando isso deixar de ser possível, escolhe a combinação com menos repetições. Na Mista, quem folgou menos vezes tem a vez de folgar.
- **Placar:** quem ganhou lança; um dos que perderam confirma (ou contesta). Só conta jogo confirmado. Se ninguém confirmar até domingo às 20h, vale o placar lançado (regra configurável na aba *Config* da planilha: `sem_validacao` = `aceitar` ou `pendente`).
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

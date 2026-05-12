### 1. Smart Session Management (Gestão Inteligente de Sessão)

Perfeito. Utilizar a estrutura de **Reconnect** que o BOT já possui é o caminho mais seguro e profissional, pois você aproveita um fluxo que o jogo já "espera" (reconexão após expiração de sessão) para mascarar as suas pausas programadas.

Ao incluir esses dois planos dentro dessa interface, você cria uma camada de proteção comportamental muito forte.

### Como integrar os 2 planos ao Reconnect existente:

#### 1. Plano de Parada Curta (Otimização de Rede)

Em vez de esperar a sessão "cair" sozinha, o BOT força o encerramento se a próxima tarefa estiver longe.

* **Ação:** Se o Farm ou o Mercado Premium calcularem que a próxima ação é daqui a **3 minutos**, o script chama a função de logout/exit.
* **Trigger de Retorno:** O próprio sistema de Reconnect da extensão assume o comando. Ele "acorda" 30 segundos antes da execução programada, clica para entrar no mundo e deixa o script pronto para agir.
* **Benefício:** Resolve o seu erro de "conexão não responde", pois cada ciclo de 3 minutos começa com uma aba "fresca" e sem lixo de memória.

#### 2. Plano de Parada Longa (Proteção Anti-Ban)

Este plano "engana" o sistema de monitoramento de tempo online da InnoGames.

* **Configuração na UI:** Você pode adicionar um campo abaixo do "Reconnect on session expired" chamado **"Smart Breaks"** ou **"Descanso Programado"**.
* **Lógica:** A cada X horas (ex: 3h), o BOT ignora o tempo de farm e força uma saída de 15 minutos.
* **Regra de Ouro:** Ele só entra em pausa longa se não houver **comandos de ataque ou suporte** (snipes/noilagem) agendados para os próximos 15-20 minutos. Comandos manuais ou automáticos de tropa sempre têm prioridade sobre o descanso.

---

### Sugestão de Layout para a UI (Extensão)

Para manter o padrão visual que você já tem no print:

1. **Smart Short Breaks (Toggle):**
* *"Sair do mundo quando inativo por mais de 3 min."*


2. **Scheduled Long Rest (Toggle + Inputs):**
* *"Pausar a cada [ 2 ] horas por [ 15 ] minutos."*
* *Nota: O BOT voltará automaticamente 1 min antes de qualquer comando.*



### Por que isso fica consistente?

Usando o Reconnect automático (que já tem aquele *delay* humano de 15-30s que aparece no seu print), o comportamento do bot fica indistinguível de um jogador que:

1. Entra, farma e fecha o jogo (Parada Curta).
2. Dá uma pausa para almoçar ou dormir (Parada Longa).

**Dica técnica:** No seu código, certifique-se de que a função que verifica a "próxima tarefa" percorra todas as vilas. Se a Vila A vai farmar em 3 min, mas a Vila B tem construção em 1 min, o BOT **não** deve sair. Ele só sai se o horizonte de eventos de **todas** as vilas for maior que o tempo limite da Parada Curta.

Se precisar de ajuda para estruturar a lógica que calcula esse "horizonte de eventos" entre os módulos (Farm vs Mercado), é só avisar!

Essa lógica de prioridade faz todo sentido, especialmente considerando a natureza do farm em lotes e as janelas críticas de produção de recursos e cunhagem.

Para que o sistema seja eficiente e não prejudique o desempenho do jogador, aqui está como a integração pode ser estruturada:

### 1. Prioridade do Farm (Smart Short Breaks)

Como o farm em lotes depende de um período definido (1 a 180 min), o **Smart Short Breaks** deve ler esse cronômetro global.

* **Ações de Curto Prazo**: Se o intervalo entre o término de um lote de farm e o início do próximo for superior ao limite definido (ex: 3 min), o bot executa o logout.
* **Retorno Inteligente**: O sistema de **Reconnect** deve ser programado para reabrir o jogo cerca de 30 a 45 segundos antes do próximo período de farm começar. Isso garante que, ao "acordar", o bot já processe a fila de farm imediatamente, mantendo a eficiência do lote.

### 2. Travas de Segurança (Cunhagem e Bônus)

Sua observação sobre a cunhagem é vital. Para evitar o desperdício de recursos, a **Scheduled Long Rest** (Parada Longa) deve respeitar estados específicos da conta:

* **Verificação de Produção**: Antes de iniciar uma pausa longa, o bot deve verificar se o módulo de cunhagem está em modo "agressivo" ou se há bônus de produção ativos.
* **Opção de "Forçar Atividade"**: Na configuração manual, você pode incluir um *checkpoint*: *"Não pausar se a cunhagem automática estiver ativa"*.
* **Prioridade Manual**: A configuração manual do usuário deve atuar como um "override". Se o jogador sabe que terá um bônus de recursos nas próximas 2 horas, ele pode desativar temporariamente a **Scheduled Long Rest** para garantir que nenhum recurso transborde no armazém.

### 3. Resumo da Hierarquia de Execução

Ao integrar esses planos ao sistema de **Reconnect on session expired** que você já possui:

| Evento | Ação do Bot | Condição de Pausa |
| --- | --- | --- |
| **Farm em Lote** | Executa o lote e calcula o tempo para o próximo período. | Entra em **Short Break** se o intervalo for > 3 min. |
| **Comando Próximo** | Mantém a sessão ativa 10 min antes do envio. | Ignora qualquer pausa (curta ou longa). |
| **Cunhagem Ativa** | Processa recursos constantemente. | Bloqueia a **Long Rest** se configurado pelo usuário. |
| **Intervalo Longo** | Inicia **Long Rest** (5 a 15 min). | Apenas se não houver comandos ou tarefas críticas pendentes. |

Essa estrutura torna o bot muito mais humano, pois ele "descansa" quando o trabalho de lote termina, mas permanece "acordado" e focado quando a economia da conta (cunhagem) ou a estratégia militar (comandos) exigem presença constante.

---

### Ajustes de arquitetura definidos

#### 1. Não fechar a aba de execução

O fluxo de **Smart Session** não deve fechar nem remover a aba principal de execução.

* **Regra:** a aba continua existindo e o retorno acontece reaproveitando o mesmo pipeline de reconnect.
* **Motivo:** isso evita recriação de aba, perda de contexto visual e acoplamento desnecessário com lógica de seleção de janela.

#### 2. Prioridade do controller para Smart Session

Na regra inicial do controller, o horizonte de bloqueio do **Smart Session** deve considerar apenas:

* **COMMAND**
* **MINT**

Isso significa:

* **SMART** tem prioridade de agenda sobre os demais fluxos fora dessa lista.
* Ao retornar de um **Short Break** ou **Long Rest**, o controller precisa executar primeiro todos os jobs atrasados antes de permitir a entrada no próximo ciclo SMART.

#### 3. Reconnect com motivo e tempo vindos do Service Worker

O fluxo de reconnect não deve mais tratar apenas `sessionExpired`.

O **Service Worker** deve informar para a tela de reconnect:

* **motivo** do wake-up:
  * `session-expired`
  * `short-break`
  * `long-rest`
* **tempo restante / horário** programado para o reconnect

Com isso, a própria página que hoje mostra algo como *"aguarde para reconnectar"* poderá exibir:

* motivo do reconnect
* tempo restante / horário previsto
* mensagem de espera compatível com o caso atual

#### 4. Persistência dedicada por world/playerId

O reconnect deixa de ser apenas uma flag dentro de `worldPlayer` e passa a ter uma **configuração própria**, chaveada por:

* `world`
* `playerId`

Essa configuração também passa a armazenar toda a estrutura do **Smart Session**, incluindo:

* toggle de reconnect por `session expired`
* configuração de **Smart Short Breaks**
* configuração de **Scheduled Long Rest**

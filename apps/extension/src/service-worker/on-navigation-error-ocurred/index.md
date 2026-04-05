# Erros de Navegação do Chrome (chrome.webNavigation)

Aqui está o significado prático dos principais erros que resultam em falha de carregamento da página e são capturados pelo `onErrorOccurred`:

- **`net::ERR_INTERNET_DISCONNECTED`**: O computador do usuário perdeu a conexão de rede local ou de internet.
- **`net::ERR_CONNECTION_TIMED_OUT`**: O servidor demorou muito para responder (geralmente problema na hospedagem ou sobrecarga no jogo). Pense como "ligar, chamar e ninguém atender".
- **`net::ERR_NAME_NOT_RESOLVED`**: Falha de DNS; o endereço do site não pôde ser traduzido para um IP.
- **`net::ERR_CONNECTION_REFUSED`**: O servidor recusou ativamente a conexão. Pense como "ligar, a pessoa atender e desligar na sua cara sem dizer nada".
- **`net::ERR_CONNECTION_ABORTED`** / **`net::ERR_ABORTED`**: O próprio usuário cancelou o carregamento (clicou no "X" do navegador) ou um script redirecionou a página antes do fim. *Importante:* Neste caso, a tela de erro nativa de queda (ex: dinossauro) **não** é exibida.
- **`net::ERR_CONNECTION_RESET`**: A conexão foi estabelecida, mas o servidor a encerrou de forma abrupta no meio da comunicação (falha interna do servidor, firewall cortando, etc). Pense como "a ligação cair de repente no meio de uma frase".
- **`net::ERR_CONNECTION_CLOSED`**: O servidor encerrou a conexão de forma "limpa", mas fez isso antes do navegador terminar de receber toda a resposta que esperava. Muitas vezes causado por timeouts muito curtos nas configurações do servidor.
- **`net::ERR_CONNECTION_FAILED`**: Falha total genérica, na maioria das vezes na infraestrutura local do usuário. Ex: Antivírus bloqueando a porta de rede repentinamente ou falha de roteamento da operadora de internet.
- **`net::ERR_CONNECTION_CLOSED_EARLY`**: O servidor começou a responder (enviou os cabeçalhos HTTP de sucesso), mas a conexão "morreu" antes do conteúdo real (HTML/dados) ser enviado por completo. Fortemente indicativo de um *crash* nos serviços internos do servidor web enquanto processava a requisição.

### Erros Ignorados (Não devem ser retentados)
Estes erros são causados pelo ambiente local do usuário ou intervenção direta, onde um recarregamento automático da extensão não resolveria o problema e causaria loop:

- **`net::ERR_ABORTED`**: O próprio usuário cancelou o carregamento (clicou no "X" do navegador).
- **`net::ERR_BLOCKED_BY_CLIENT`**: Uma extensão (como AdBlock), recurso nativo do navegador ou Antivírus bloqueou ativamente a requisição do site.
- **`net::ERR_CERT_AUTHORITY_INVALID` / `net::ERR_CERT_DATE_INVALID`**: Problema de certificado SSL. Quase sempre é causado pelo relógio do PC do usuário estar errado ou o software de antivírus desconfigurado interceptando a conexão (MitM). O usuário precisa consertar a máquina ou aceitar os riscos manualmente na tela.
- **`net::ERR_BLOCKED_BY_ADMINISTRATOR`**: Bloqueado por política corporativa de empresa ou Family Link na rede.

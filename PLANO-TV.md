# Plano: limpar a LG webOS e colocar um launcher próprio

Contexto para a sessão do Claude Code que vai rodar no PC do usuário, na mesma rede da TV.

## Regras (definidas pelo usuário)
- Tudo tem que ser **reversível**.
- **Desativar, nunca apagar.** Não escrever na área do sistema (rootfs). Mudanças só em áreas graváveis (`/var`, `/media/developer`, `/var/lib/webosbrew`), que o reset de fábrica limpa.
- Cada passo de limpeza precisa de um passo de restauração equivalente (`limpar.sh` / `restaurar.sh`).

## Base
- Free My TV (MIT): https://github.com/simbasjungles/free-my-tv
  - Parte LG: `web/` (UI em HTML/CSS/JS) e `webos/` (`build.py`, `install.py`), além do `config.example.properties`.
  - Sem root, na LG ele roda como app pelo Developer Mode. Ele não substitui o processo da home, então ganha pouco em velocidade.
- Para ficar leve de verdade é preciso root (webOS Homebrew: RootMyTV / DejaVuln / faultmanager-autoroot, conforme o firmware) e o Homebrew Channel.

## Passos
1. Coletar o modelo, a versão do webOS e o firmware (Configurações → Suporte → Informações da TV).
2. Fazer a limpeza sem root nas configurações: desligar Informações de visualização / Live Plus (ACR), anúncios e recomendações.
3. Verificar se existe root para esse firmware. Se existir, aplicar e instalar o Homebrew Channel.
4. Fazer backup: lista de apps e serviços ativos e configurações relevantes, salvos no repositório.
5. Escrever `limpar.sh`, que desativa bloatware, telemetria e anúncios (bloqueio por hosts e desativação via luna-send), e `restaurar.sh`, que desfaz exatamente o que o primeiro fez.
6. Adaptar o launcher do Free My TV (enxuto, sem anúncio) e configurá-lo para abrir ao ligar a TV (init.d do webosbrew).
7. Documentar como voltar ao original: `restaurar.sh`, remoção do app, reset de fábrica e atualização de firmware.

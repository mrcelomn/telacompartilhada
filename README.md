<div align="center">

# Tela Compartilhada

**Assista junto com os amigos, com o som só do programa que você escolher.**

Crie uma sala, chame a galera e compartilhe a janela de um filme, jogo ou vídeo.
O áudio da call do Discord fica de fora, então ninguém escuta eco.

<br>

<a href="../../releases/latest/download/TelaCompartilhada.exe">
  <img src="https://img.shields.io/badge/Baixar_para_Windows-TelaCompartilhada.exe-1f2328?style=for-the-badge&logo=windows&logoColor=white" alt="Baixar para Windows">
</a>

<sub>Não precisa instalar · Windows 10 (2004+) ou 11 · <a href="../../releases/latest">outras opções de download</a></sub>

<br><br>

<img src="docs/sala.png" alt="Sala com uma transmissão ao vivo" width="820">

</div>

<br>

## Como usar

| | |
|---|---|
| **1. Escolha um nickname** | Na primeira vez que abrir. Fica salvo no seu PC. |
| **2. Crie uma sala** | Digite um nome, tipo `cinema-da-galera`, e clique em **Criar sala**. |
| **3. Chame os amigos** | Eles digitam o mesmo nome e clicam em **Entrar**. |
| **4. Compartilhe** | Clique em **Compartilhar** e escolha a janela. Só o som daquele programa vai junto. |

Para sair, clique em **Sair**. Se o dono sair, a sala fecha pra todo mundo.

<br>

## O que ele faz

- **Som só do programa:** você escolhe a janela e o áudio vem só dela. Discord, notificações e o resto do PC ficam de fora.
- **Salas com nome:** sem código esquisito, é só combinar o nome da sala.
- **Qualquer um transmite:** todo mundo na sala pode compartilhar a própria tela.
- **Controle de volume:** cada transmissão tem mudo e volume próprios.
- **Sem microfone:** a conversa continua no Discord, o programa cuida só da tela e do som.

<br>

<p align="center">
  <img src="docs/lobby.png" alt="Tela para criar ou entrar numa sala" width="620">
</p>

<br>

## Bom saber

<details>
<summary><b>Apareceu "O Windows protegeu o computador"</b></summary>
<br>
Clique em <b>Mais informações</b> e depois em <b>Executar assim mesmo</b>. O aviso aparece porque o programa não tem assinatura digital paga.
</details>

<details>
<summary><b>Quantas pessoas cabem numa sala?</b></summary>
<br>
Funciona melhor com até 4 pessoas assistindo. A transmissão sai direto do PC de quem compartilha, então depende da internet (upload) dessa pessoa.
</details>

<details>
<summary><b>Diz que a sala já existe</b></summary>
<br>
Os nomes de sala são compartilhados entre todo mundo que usa o programa. Escolha um nome mais único.
</details>

<details>
<summary><b>O som não sai</b></summary>
<br>
Dê play no vídeo antes de compartilhar e, na janela de escolha, selecione o programa em <b>Som de</b>.
</details>

<br>

## Para desenvolvedores

```bash
npm install
npm start
```

| Pasta | O que tem |
|---|---|
| `src/` | App Electron (interface, salas via WebRTC/PeerJS) |
| `native/` | Captura de áudio por programa (WASAPI process loopback) |
| `.github/workflows/` | Build do Windows, publica o `.exe` em Releases a cada push na `main` |

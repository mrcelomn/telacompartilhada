const $ = id => document.getElementById(id);
const status = t => $('status').textContent = t;
let peer, conn, telaStream, telaCall, amigoId, audioCtx, worklet;

peer = new Peer('tela-' + Math.random().toString(36).slice(2, 7));
peer.on('open', id => { $('meuId').textContent = id; });
peer.on('error', e => status('Erro: ' + e.type + (e.type === 'peer-unavailable' ? ' (código do amigo não encontrado)' : '')));
$('meuId').onclick = () => navigator.clipboard.writeText($('meuId').textContent).then(() => status('Código copiado!'));

peer.on('connection', configurarConexao);
$('btnConectar').onclick = () => {
  const id = $('idAmigo').value.trim();
  if (!id) return status('Digite o código do amigo.');
  configurarConexao(peer.connect(id, { reliable: true }));
};
function configurarConexao(c) {
  conn = c; amigoId = c.peer;
  c.on('open', () => { document.body.classList.add('conectado'); status('Conectado com ' + amigoId + '.'); $('btnTela').disabled = false; });
  c.on('data', m => { if (m === 'parou-tela') esconderRemota(); });
  c.on('close', () => { document.body.classList.remove('conectado'); status('Amigo desconectou.'); esconderRemota(); $('btnTela').disabled = true; });
}

// Recebendo
peer.on('call', call => {
  call.answer();
  call.on('stream', s => {
    $('vidRemota').srcObject = s;
    $('audTela').srcObject = s.getAudioTracks().length ? new MediaStream(s.getAudioTracks()) : null;
    $('boxRemota').classList.remove('oculto'); ajustarLayout();
  });
  call.on('close', esconderRemota);
});

// Escolher janela
$('btnTela').onclick = async () => {
  if (telaStream) return pararTela();
  const [fontes, apps] = await Promise.all([nativo.fontes(), nativo.appsAudio()]);
  const sel = $('selAudio'); sel.innerHTML = '<option value="">Automático (programa da janela)</option><option value="0">Sem som</option>';
  for (const a of apps) { const o = document.createElement('option'); o.value = a.pid; o.textContent = a.nome + ' (tocando som)'; sel.appendChild(o); }
  $('lista').innerHTML = '';
  for (const f of fontes) {
    const d = document.createElement('div'); d.className = 'fonte';
    d.innerHTML = `<img src="${f.thumb}"><div></div>`;
    d.lastChild.textContent = f.name;
    d.onclick = () => { $('picker').classList.add('oculto'); compartilhar(f); };
    $('lista').appendChild(d);
  }
  $('picker').classList.remove('oculto');
};
$('btnCancelar').onclick = () => $('picker').classList.add('oculto');

async function compartilhar(f) {
  const video = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
    chromeMediaSource: 'desktop', chromeMediaSourceId: f.id, maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 } } });
  telaStream = new MediaStream(video.getVideoTracks());
  telaStream.getVideoTracks()[0].onended = pararTela;

  let temSom = false;
  const escolha = $('selAudio').value;
  if (escolha !== '0' && (escolha || f.id.startsWith('window:'))) {
    const track = await iniciarAudioApp();
    temSom = await nativo.audioIniciar(f.id, escolha);
    if (temSom) telaStream.addTrack(track);
  }
  $('vidLocal').srcObject = telaStream;
  $('boxLocal').classList.remove('oculto'); ajustarLayout();
  telaCall = peer.call(amigoId, telaStream);
  $('btnTela').textContent = 'Parar'; $('btnTela').className = 'red';
  status('Compartilhando "' + f.name + '"' + (temSom ? ' com o som só desse programa.' : ' sem som.'));
}

// Áudio do programa: PCM 48kHz 16-bit estéreo vindo do audio-app.exe -> track WebRTC
const WORKLET = `
class P extends AudioWorkletProcessor {
  constructor() { super(); this.b = new Float32Array(48000 * 4); this.r = 0; this.w = 0; this.n = 0;
    this.port.onmessage = e => { const s = new Int16Array(e.data), L = this.b.length;
      for (let i = 0; i < s.length; i++) { this.b[this.w] = s[i] / 32768; this.w = (this.w + 1) % L; }
      this.n = Math.min(this.n + s.length, L);
      if (this.n > 48000 * 2 * 0.25) { const drop = this.n - 9600; this.r = (this.r + drop) % L; this.n -= drop; } }; }
  process(_, outs) { const o = outs[0], L = this.b.length;
    for (let i = 0; i < o[0].length; i++) {
      if (this.n >= 2) { o[0][i] = this.b[this.r]; o[1][i] = this.b[(this.r + 1) % L]; this.r = (this.r + 2) % L; this.n -= 2; }
      else { o[0][i] = 0; o[1][i] = 0; } }
    return true; } }
registerProcessor('p', P);`;
async function iniciarAudioApp() {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 48000 });
    await audioCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
    worklet = new AudioWorkletNode(audioCtx, 'p', { outputChannelCount: [2] });
    nativo.onAudio(d => { const c = d.slice(); worklet.port.postMessage(c.buffer, [c.buffer]); });
    nativo.onAudioFim(c => { if (c) status('Captura de áudio parou (código ' + c + '). Precisa Windows 10 2004+ / 11.'); });
  }
  const dest = audioCtx.createMediaStreamDestination();
  worklet.disconnect(); worklet.connect(dest);
  return dest.stream.getAudioTracks()[0];
}

function pararTela() {
  nativo.audioParar();
  telaStream?.getTracks().forEach(t => t.stop());
  telaStream = null; telaCall?.close(); telaCall = null;
  conn?.open && conn.send('parou-tela');
  $('boxLocal').classList.add('oculto'); ajustarLayout();
  $('btnTela').textContent = 'Compartilhar'; $('btnTela').className = 'grn';
  status('Parou de compartilhar.');
}
function esconderRemota() {
  $('vidRemota').srcObject = null; $('audTela').srcObject = null;
  $('boxRemota').classList.add('oculto'); ajustarLayout();
}
function ajustarLayout() {
  const n = document.querySelectorAll('.box:not(.oculto)').length;
  $('main').classList.toggle('dois', n === 2);
  $('vazio').classList.toggle('oculto', n > 0);
}
$('vidRemota').ondblclick = () => $('vidRemota').requestFullscreen();

// Mutar / volume da transmissão que você está assistindo
function atualizarSom() {
  const a = $('audTela'), mudo = a.muted || a.volume === 0;
  $('btnMudo').innerHTML = (mudo ? ICONE_MUDO + 'Mudo' : ICONE_SOM + 'Som');
  $('btnMudo').className = mudo ? 'red' : 'fantasma';
}
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONE_SOM = SVG('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>');
const ICONE_MUDO = SVG('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>');
atualizarSom();
$('btnMudo').onclick = () => { $('audTela').muted = !$('audTela').muted; atualizarSom(); };
$('volume').oninput = e => { $('audTela').volume = e.target.value / 100; if (e.target.value > 0) $('audTela').muted = false; atualizarSom(); };

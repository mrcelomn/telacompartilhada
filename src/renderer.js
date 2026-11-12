const $ = id => document.getElementById(id);
const status = t => $('status').textContent = t;
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONE_SOM = SVG('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>');
const ICONE_MUDO = SVG('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/>');
const ICONE_CAM = SVG('<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>');
const ICONE_CAM_OFF = SVG('<path d="M10.7 6H14a2 2 0 0 1 2 2v3.3l1 1L22 7v10"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"/><path d="m2 2 20 20"/>');

// ---------- estado ----------
let peer = null, souHost = false, hostConn = null, nomeSala = '', meuNome = '';
const membros = new Map();   // (só no host) peerId -> { nome, conn, transmitindo }
let lista = [];              // [{ id, nome, host, transmitindo }]
let telaStream = null, camStream = null;
const chamadas = new Map();     // peerId -> chamada saindo (minha tela)
const chamadasCam = new Map();  // peerId -> chamada saindo (minha câmera)
const remotos = new Map();      // 'peerId:tela' | 'peerId:cam' -> { box, audio, video }
const chave = (id, tipo) => id + ':' + tipo;
const doRemoto = k => { const i = k.lastIndexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
let audioCtx, worklet;

const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const idDaSala = nome => 'tcsala-' + slug(nome);

// ---------- conta (nickname salvo neste PC) ----------
const ler = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
meuNome = ler('nome'); $('inSala').value = ler('sala');

function mostrarConta() {
  const tem = !!meuNome;
  $('cadastro').classList.toggle('oculto', tem);
  $('lobby').classList.toggle('oculto', !tem);
  $('conta').classList.toggle('oculto', !tem); $('sepConta').classList.add('oculto');
  $('txtConta').textContent = meuNome; $('avConta').textContent = (meuNome[0] || '').toUpperCase();
  if (!tem) setTimeout(() => $('inNome').focus()); else setTimeout(() => $('inSala').focus());
}
$('btnSalvarNick').onclick = () => {
  const n = $('inNome').value.trim();
  if (!n) return $('erroNick').textContent = 'Digite um nickname.';
  meuNome = n; gravar('nome', n); $('erroNick').textContent = ''; mostrarConta();
};
$('inNome').onkeydown = e => { if (e.key === 'Enter') $('btnSalvarNick').click(); };
$('btnTrocarNick').onclick = () => { if (peer) sair(''); $('inNome').value = meuNome; meuNome = ''; mostrarConta(); };
mostrarConta();

// ---------- lobby ----------
function lerCampos() {
  nomeSala = $('inSala').value.trim();
  if (!slug(nomeSala)) return erro('Digite o nome da sala.'), false;
  gravar('sala', nomeSala);
  erro(''); travarLobby(true); return true;
}
const erro = t => $('erroLobby').textContent = t;
const travarLobby = v => { $('btnCriar').disabled = v; $('btnEntrar').disabled = v; };

$('btnCriar').onclick = () => {
  if (!lerCampos()) return;
  peer = new Peer(idDaSala(nomeSala));
  peer.on('open', () => {
    souHost = true;
    membros.set(peer.id, { nome: meuNome, transmitindo: false });
    peer.on('connection', aceitarMembro);
    abrirSala(); enviarLista();
  });
  peer.on('error', e => {
    if (e.type === 'unavailable-id') return falhaLobby('Já existe uma sala com esse nome. Clique em Entrar ou escolha outro nome.');
    tratarErro(e);
  });
  configurarChamadas();
};

$('btnEntrar').onclick = () => {
  if (!lerCampos()) return;
  peer = new Peer();
  peer.on('open', () => {
    const c = peer.connect(idDaSala(nomeSala), { reliable: true });
    c.on('open', () => { hostConn = c; c.send({ t: 'ola', nome: meuNome }); abrirSala(); });
    c.on('data', m => { if (m.t === 'lista') aplicarLista(m.membros); });
    c.on('close', () => sair('A sala foi fechada pelo dono.'));
  });
  peer.on('error', e => {
    if (e.type === 'peer-unavailable' && !hostConn) return falhaLobby('Sala não encontrada. Confira o nome ou clique em Criar sala.');
    tratarErro(e);
  });
  configurarChamadas();
};
$('inSala').onkeydown = e => { if (e.key === 'Enter') $('btnEntrar').click(); };

function falhaLobby(msg) { peer?.destroy(); peer = null; travarLobby(false); erro(msg); }
function tratarErro(e) {
  if (!$('sala').classList.contains('oculto')) status('Erro de conexão: ' + e.type);
  else falhaLobby('Erro de conexão: ' + e.type);
}

function abrirSala() {
  $('lobby').classList.add('oculto'); $('sala').classList.remove('oculto'); $('topoSala').classList.remove('oculto'); $('sepConta').classList.remove('oculto');
  $('txtSala').innerHTML = ''; $('txtSala').textContent = nomeSala;
  const sm = document.createElement('small'); sm.textContent = souHost ? 'você é o dono' : ''; $('txtSala').appendChild(sm);
  document.body.classList.add('conectado');
  status(souHost ? 'Sala criada. Passe o nome "' + nomeSala + '" pros amigos.' : 'Você entrou na sala.');
  ajustarLayout();
}

$('btnSair').onclick = () => sair('');
function sair(msg) {
  pararTela(); pararCamera();
  for (const id of [...remotos.keys()]) fecharRemoto(id);
  peer?.destroy(); peer = null; hostConn = null; souHost = false; membros.clear(); lista = [];
  document.body.classList.remove('conectado');
  $('sala').classList.add('oculto'); $('topoSala').classList.add('oculto'); mostrarConta();
  travarLobby(false); erro(msg);
}

// ---------- host: controla quem está na sala ----------
function aceitarMembro(c) {
  c.on('data', m => {
    if (m.t === 'ola') { membros.set(c.peer, { nome: String(m.nome).slice(0, 24), conn: c, transmitindo: false, camera: false }); enviarLista(); }
    if (m.t === 'transmitindo' && membros.has(c.peer)) { membros.get(c.peer).transmitindo = !!m.on; enviarLista(); }
    if (m.t === 'camera' && membros.has(c.peer)) { membros.get(c.peer).camera = !!m.on; enviarLista(); }
  });
  c.on('close', () => { membros.delete(c.peer); enviarLista(); });
}
function enviarLista() {
  const l = [...membros].map(([id, m]) => ({ id, nome: m.nome, host: id === peer.id, transmitindo: m.transmitindo, camera: !!m.camera }));
  for (const m of membros.values()) if (m.conn?.open) m.conn.send({ t: 'lista', membros: l });
  aplicarLista(l);
}
function avisarTransmissao(on) {
  if (souHost) { membros.get(peer.id).transmitindo = on; enviarLista(); }
  else if (hostConn?.open) hostConn.send({ t: 'transmitindo', on });
}
function avisarCamera(on) {
  if (souHost) { membros.get(peer.id).camera = on; enviarLista(); }
  else if (hostConn?.open) hostConn.send({ t: 'camera', on });
}

// ---------- lista de membros ----------
function aplicarLista(l) {
  lista = l;
  const ids = new Set(l.map(m => m.id));
  // quem saiu ou parou de transmitir / desligou a câmera
  for (const k of [...remotos.keys()]) {
    const [id, tipo] = doRemoto(k), m = l.find(x => x.id === id);
    if (!m || !(tipo === 'cam' ? m.camera : m.transmitindo)) fecharRemoto(k);
  }
  for (const mapa of [chamadas, chamadasCam]) for (const [id, ch] of mapa) if (!ids.has(id)) { ch.close(); mapa.delete(id); }
  // se estou transmitindo / com câmera, mando pra quem chegou agora
  for (const m of l) if (m.id !== peer.id) {
    if (telaStream && !chamadas.has(m.id)) ligar(m.id);
    if (camStream && !chamadasCam.has(m.id)) ligarCam(m.id);
  }
  desenharMembros();
  for (const [k, r] of remotos) { const [id, tipo] = doRemoto(k), m = l.find(x => x.id === id); if (m) r.box.querySelector('span').textContent = rotulo(m.nome, tipo); }
}
function desenharMembros() {
  const ul = $('membros'); ul.innerHTML = '';
  for (const m of lista) {
    const li = document.createElement('li');
    const av = document.createElement('span'); av.className = 'av'; av.textContent = (m.nome[0] || '?').toUpperCase();
    const nm = document.createElement('span'); nm.textContent = m.nome + (m.id === peer?.id ? ' (você)' : '');
    const tag = document.createElement('span'); tag.className = 'tag' + (m.transmitindo ? ' ao-vivo' : '');
    tag.textContent = m.transmitindo ? 'ao vivo' : (m.host ? 'dono' : '');
    li.append(av, nm, tag);
    if (m.camera) { const c = document.createElement('span'); c.className = 'cam'; c.title = 'Câmera ligada'; c.innerHTML = ICONE_CAM; li.appendChild(c); }
    ul.appendChild(li);
  }
}

// ---------- receber transmissões ----------
function configurarChamadas() {
  peer.on('call', call => {
    const tipo = call.metadata?.tipo === 'cam' ? 'cam' : 'tela';
    call.answer();
    call.on('stream', s => mostrarRemoto(call.peer, tipo, s));
    call.on('close', () => fecharRemoto(chave(call.peer, tipo)));
  });
}
const rotulo = (nome, tipo) => tipo === 'cam' ? nome + ' (câmera)' : nome;
function mostrarRemoto(id, tipo, stream) {
  const k = chave(id, tipo);
  let r = remotos.get(k);
  if (!r) {
    const box = document.createElement('div'); box.className = 'box' + (tipo === 'cam' ? ' camBox' : '');
    box.innerHTML = `<span></span><video autoplay muted></video><div class="ctrl"><button class="fantasma"></button><input type="range" min="0" max="100" value="100" title="Volume"></div>`;
    const audio = new Audio(); audio.autoplay = true;
    const btn = box.querySelector('button'), vol = box.querySelector('input'), video = box.querySelector('video');
    const atualizar = () => { const mudo = audio.muted || audio.volume === 0; btn.innerHTML = mudo ? ICONE_MUDO + 'Mudo' : ICONE_SOM + 'Som'; btn.className = mudo ? 'red' : 'fantasma'; };
    btn.onclick = () => { audio.muted = !audio.muted; atualizar(); };
    vol.oninput = () => { audio.volume = vol.value / 100; if (vol.value > 0) audio.muted = false; atualizar(); };
    video.ondblclick = () => video.requestFullscreen();
    atualizar();
    if (tipo === 'cam') box.querySelector('.ctrl').remove();   // câmera vai sem som
    $('main').prepend(box);
    r = { box, audio, video }; remotos.set(k, r);
  }
  const nome = lista.find(m => m.id === id)?.nome;
  r.box.querySelector('span').textContent = nome ? rotulo(nome, tipo) : (tipo === 'cam' ? 'Câmera' : 'Transmissão');
  r.video.srcObject = stream;
  r.audio.srcObject = stream.getAudioTracks().length ? new MediaStream(stream.getAudioTracks()) : null;
  ajustarLayout();
}
function fecharRemoto(k) {
  const r = remotos.get(k); if (!r) return;
  r.video.srcObject = null; r.audio.srcObject = null; r.box.remove(); remotos.delete(k); ajustarLayout();
}

// ---------- câmera ----------
$('btnCam').innerHTML = ICONE_CAM + 'Câmera';
$('btnCam').onclick = async () => {
  if (camStream) return pararCamera();
  $('btnCam').disabled = true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  } catch (e) {
    console.error(e); camStream = null; $('btnCam').disabled = false;
    return status(e.name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste PC.' : 'Não deu pra abrir a câmera (' + e.name + '). Veja se outro programa está usando ela.');
  }
  $('btnCam').disabled = false;
  camStream.getVideoTracks()[0].onended = pararCamera;
  $('vidCam').srcObject = camStream;
  $('boxCam').classList.remove('oculto'); ajustarLayout();
  for (const m of lista) if (m.id !== peer.id) ligarCam(m.id);
  avisarCamera(true);
  $('btnCam').innerHTML = ICONE_CAM_OFF + 'Desligar câmera'; $('btnCam').className = 'red';
  status('Sua câmera está ligada.');
};
function ligarCam(id) { chamadasCam.set(id, peer.call(id, camStream, { metadata: { nome: meuNome, tipo: 'cam' } })); }
function pararCamera() {
  if (!camStream) return;
  camStream.getTracks().forEach(t => t.stop());
  camStream = null;
  for (const ch of chamadasCam.values()) ch.close();
  chamadasCam.clear();
  if (peer) avisarCamera(false);
  $('vidCam').srcObject = null;
  $('boxCam').classList.add('oculto'); ajustarLayout();
  $('btnCam').innerHTML = ICONE_CAM + 'Câmera'; $('btnCam').className = 'fantasma';
  status('Câmera desligada.');
}

// ---------- transmitir ----------
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
    try {
      const track = await iniciarAudioApp();
      temSom = await nativo.audioIniciar(f.id, escolha);
      if (temSom) telaStream.addTrack(track);
    } catch (e) { console.error(e); }
  }
  $('vidLocal').srcObject = telaStream;
  $('boxLocal').classList.remove('oculto'); ajustarLayout();
  for (const m of lista) if (m.id !== peer.id) ligar(m.id);
  avisarTransmissao(true);
  $('btnTela').textContent = 'Parar'; $('btnTela').className = 'red';
  status('Transmitindo "' + f.name + '"' + (temSom ? ' com o som só desse programa.' : ' sem som.'));
}
function ligar(id) { chamadas.set(id, peer.call(id, telaStream, { metadata: { nome: meuNome, tipo: 'tela' } })); }

// Áudio do programa: PCM 48kHz 16-bit estéreo vindo do audio-app.exe -> track WebRTC
// (ScriptProcessor em vez de AudioWorklet: worklet não carrega em página file://)
const RING = new Float32Array(48000 * 4); let rR = 0, rW = 0, rN = 0;
function empurrarAudio(d) {
  const s = new Int16Array(d.slice().buffer), L = RING.length;
  for (let i = 0; i < s.length; i++) { RING[rW] = s[i] / 32768; rW = (rW + 1) % L; }
  rN = Math.min(rN + s.length, L);
  if (rN > 48000 * 2 * 0.25) { const drop = rN - 9600; rR = (rR + drop) % L; rN -= drop; } // segura atraso < 250ms
}
let destAudio;
async function iniciarAudioApp() {
  if (!audioCtx) {
    audioCtx = new AudioContext({ sampleRate: 48000 });
    const proc = audioCtx.createScriptProcessor(1024, 0, 2);
    proc.onaudioprocess = e => {
      const l = e.outputBuffer.getChannelData(0), r = e.outputBuffer.getChannelData(1), L = RING.length;
      for (let i = 0; i < l.length; i++) {
        if (rN >= 2) { l[i] = RING[rR]; r[i] = RING[(rR + 1) % L]; rR = (rR + 2) % L; rN -= 2; } else { l[i] = 0; r[i] = 0; }
      }
    };
    destAudio = audioCtx.createMediaStreamDestination();
    proc.connect(destAudio);
    worklet = proc;
    nativo.onAudio(empurrarAudio);
    nativo.onAudioFim(c => { if (c) status('Captura de áudio parou (código ' + c + '). Precisa Windows 10 2004+ / 11.'); });
  }
  await audioCtx.resume();
  rR = rW = rN = 0;
  return destAudio.stream.getAudioTracks()[0].clone();
}

function pararTela() {
  if (!telaStream) return;
  nativo.audioParar();
  telaStream.getTracks().forEach(t => t.stop());
  telaStream = null;
  for (const ch of chamadas.values()) ch.close();
  chamadas.clear();
  if (peer) avisarTransmissao(false);
  $('vidLocal').srcObject = null;
  $('boxLocal').classList.add('oculto'); ajustarLayout();
  $('btnTela').textContent = 'Compartilhar'; $('btnTela').className = 'grn';
  status('Parou de transmitir.');
}

function ajustarLayout() {
  const n = document.querySelectorAll('#main .box:not(.oculto)').length;
  $('main').classList.toggle('dois', n === 2);
  $('main').classList.toggle('varios', n > 2);
  $('vazio').classList.toggle('oculto', n > 0);
}

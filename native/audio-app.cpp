// Captura o áudio SÓ de um processo (e filhos) via WASAPI process loopback (Windows 10 2004+ / 11).
// Uso: audio-app.exe <HWND>   ou   audio-app.exe pid:<PID>
// Saída: PCM 48000 Hz, 16-bit, estéreo, no stdout.
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <wrl/implements.h>
#include <io.h>
#include <fcntl.h>
#include <cstdio>
#include <cwchar>
#include <vector>
#include <string>
#include <set>
#include <audiopolicy.h>
#pragma comment(lib, "mmdevapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "kernel32.lib")
using namespace Microsoft::WRL;

class Handler : public RuntimeClass<RuntimeClassFlags<ClassicCom>, FtmBase, IActivateAudioInterfaceCompletionHandler> {
public:
  HANDLE done = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  HRESULT hr = E_FAIL;
  ComPtr<IAudioClient> client;
  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* op) override {
    HRESULT hrAct = E_FAIL; ComPtr<IUnknown> unk;
    hr = op->GetActivateResult(&hrAct, &unk);
    if (SUCCEEDED(hr)) hr = hrAct;
    if (SUCCEEDED(hr)) hr = unk.As(&client);
    SetEvent(done);
    return S_OK;
  }
};


static std::wstring nomeProcesso(DWORD pid) {
  wchar_t buf[MAX_PATH] = L""; DWORD n = MAX_PATH;
  HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (h) { QueryFullProcessImageNameW(h, 0, buf, &n); CloseHandle(h); }
  std::wstring s = buf; size_t i = s.find_last_of(L'\\');
  return i == std::wstring::npos ? s : s.substr(i + 1);
}

// Apps da Store (Filmes e TV etc.): a janela é do ApplicationFrameHost; o som vem da janela filha (CoreWindow)
struct Busca { DWORD host; DWORD achado; };
static BOOL CALLBACK filho(HWND w, LPARAM l) {
  Busca* b = (Busca*)l; DWORD pid = 0; GetWindowThreadProcessId(w, &pid);
  if (pid && pid != b->host) { b->achado = pid; return FALSE; }
  return TRUE;
}

// Lista processos que têm sessão de áudio: "pid<TAB>nome"
static int listar() {
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  _setmode(_fileno(stdout), _O_U8TEXT);
  ComPtr<IMMDeviceEnumerator> en;
  if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&en)))) return 4;
  ComPtr<IMMDeviceCollection> devs; en->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devs);
  UINT nd = 0; if (devs) devs->GetCount(&nd);
  std::set<DWORD> vistos;
  for (UINT d = 0; d < nd; d++) {
    ComPtr<IMMDevice> dev; devs->Item(d, &dev);
    ComPtr<IAudioSessionManager2> mgr;
    if (FAILED(dev->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, (void**)mgr.GetAddressOf()))) continue;
    ComPtr<IAudioSessionEnumerator> se; if (FAILED(mgr->GetSessionEnumerator(&se))) continue;
    int ns = 0; se->GetCount(&ns);
    for (int i = 0; i < ns; i++) {
      ComPtr<IAudioSessionControl> c; se->GetSession(i, &c);
      ComPtr<IAudioSessionControl2> c2; if (FAILED(c.As(&c2))) continue;
      DWORD pid = 0; c2->GetProcessId(&pid);
      if (!pid || vistos.count(pid)) continue;
      vistos.insert(pid);
      std::wstring nome = nomeProcesso(pid);
      if (!nome.empty()) wprintf(L"%lu\t%ls\n", pid, nome.c_str());
    }
  }
  return 0;
}

static int falha(const char* o, HRESULT hr) { fprintf(stderr, "%s falhou: 0x%08lx\n", o, (unsigned long)hr); return 3; }

int wmain(int argc, wchar_t** argv) {
  if (argc < 2) { fprintf(stderr, "uso: audio-app.exe <hwnd|pid:N|list>\n"); return 1; }
  if (wcscmp(argv[1], L"list") == 0) return listar();
  DWORD pid = 0;
  if (wcsncmp(argv[1], L"pid:", 4) == 0) pid = wcstoul(argv[1] + 4, nullptr, 10);
  else {
    HWND w = (HWND)(ULONG_PTR)_wcstoui64(argv[1], nullptr, 10);
    GetWindowThreadProcessId(w, &pid);
    if (_wcsicmp(nomeProcesso(pid).c_str(), L"ApplicationFrameHost.exe") == 0) {
      Busca b{ pid, 0 }; EnumChildWindows(w, filho, (LPARAM)&b);
      if (b.achado) pid = b.achado;
    }
  }
  if (!pid) { fprintf(stderr, "processo nao encontrado\n"); return 2; }

  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  _setmode(_fileno(stdout), _O_BINARY);

  AUDIOCLIENT_ACTIVATION_PARAMS p = {};
  p.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  p.ProcessLoopbackParams.TargetProcessId = pid;
  p.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
  PROPVARIANT pv = {}; pv.vt = VT_BLOB; pv.blob.cbSize = sizeof(p); pv.blob.pBlobData = (BYTE*)&p;

  auto h = Make<Handler>();
  ComPtr<IActivateAudioInterfaceAsyncOperation> op;
  HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &pv, h.Get(), &op);
  if (FAILED(hr)) return falha("ActivateAudioInterfaceAsync", hr);
  WaitForSingleObject(h->done, INFINITE);
  if (FAILED(h->hr)) return falha("Ativacao", h->hr);
  IAudioClient* c = h->client.Get();

  WAVEFORMATEX wf = {};
  wf.wFormatTag = WAVE_FORMAT_PCM; wf.nChannels = 2; wf.nSamplesPerSec = 48000; wf.wBitsPerSample = 16;
  wf.nBlockAlign = 4; wf.nAvgBytesPerSec = 48000 * 4;
  hr = c->Initialize(AUDCLNT_SHAREMODE_SHARED,
    AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
    200000, 0, &wf, nullptr);
  if (FAILED(hr)) return falha("Initialize", hr);

  HANDLE ev = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  c->SetEventHandle(ev);
  ComPtr<IAudioCaptureClient> cap;
  hr = c->GetService(IID_PPV_ARGS(&cap));
  if (FAILED(hr)) return falha("GetService", hr);
  hr = c->Start();
  if (FAILED(hr)) return falha("Start", hr);

  std::vector<BYTE> zeros;
  for (;;) {
    WaitForSingleObject(ev, 100);
    UINT32 n = 0;
    while (SUCCEEDED(cap->GetNextPacketSize(&n)) && n) {
      BYTE* data; UINT32 frames; DWORD flags;
      if (FAILED(cap->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) break;
      size_t bytes = (size_t)frames * 4;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) { zeros.assign(bytes, 0); data = zeros.data(); }
      size_t ok = fwrite(data, 1, bytes, stdout);
      cap->ReleaseBuffer(frames);
      if (ok != bytes || fflush(stdout) != 0) return 0; // app principal fechou
    }
  }
}

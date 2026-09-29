/* VM の確認用（DK-08）。GDM の「Ubuntu」（Wayland）で GNOME Shell が起動時に止まるのを避ける差し込み（LD_PRELOAD）。
 * 止まる理由（gdb で確認）: シェルの主スレッドが音量の部品（libgvc → libpulse の pa_client_conf_from_x11）から自分の X 画面へ
 * 同期でつなぎに行き、「使われたら起こす」Xwayland はシェルの応答を待つ。client.conf の auto-connect-display = no は効かない
 * （X の設定読みは DISPLAY があれば必ず行う）。libpulse（libpulsecommon）からの xcb_connect だけを存在しない画面へ向けて
 * すぐ失敗させ、他の呼び出しはそのまま通す。子のプロセスには引き継がない。vm-gdm-session.sh wayland が作って入れる。丸の本体は使わない。 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdlib.h>
#include <string.h>

typedef struct xcb_connection_t xcb_connection_t;
typedef xcb_connection_t *(*connect_fn)(const char *, int *);

__attribute__((constructor)) static void nf_init(void) { unsetenv("LD_PRELOAD"); }

xcb_connection_t *xcb_connect(const char *name, int *screen) {
  static connect_fn real;
  Dl_info info;
  if (!real) real = (connect_fn)dlsym(RTLD_NEXT, "xcb_connect");
  /* libxcb が RTLD_LOCAL で読まれた場合（python の ctypes など）は RTLD_NEXT で見つからない */
  if (!real) {
    void *h = dlopen("libxcb.so.1", RTLD_LAZY);
    if (h) real = (connect_fn)dlsym(h, "xcb_connect");
  }
  if (dladdr(__builtin_return_address(0), &info) && info.dli_fname && strstr(info.dli_fname, "libpulsecommon"))
    return real(":65534", screen);
  return real(name, screen);
}

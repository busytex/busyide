#include <unistd.h>
#include <setjmp.h>

extern jmp_buf vfork_jump_buffer;
int em_vfork(int is_parent);
void em_exit(int status);
int em_execvp(const char *file, char *const argv[]);
pid_t js_waitpid(pid_t pid, int *status, int options);

#define vfork() (em_vfork(setjmp(vfork_jump_buffer)))
#define _exit(status) (em_exit(status))
#define _Exit(status) (em_exit(status))
#define execvp(file, argv) (em_execvp((file), (argv)))
#define waitpid(pid, status, options) js_waitpid(pid, status, options)

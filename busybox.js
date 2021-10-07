export class Busybox
{
    constructor(busybox_module_constructor, busybox_wasm_module_promise, printErr = null, print = null, verbose = false)
    {
        this.mem_header_size = 2 ** 25;
        this.wasm_module_promise = busybox_wasm_module_promise.then(WebAssembly.compileStreaming);
        this.busybox_module_constructor = busybox_module_constructor;
        this.print = print;
        this.printErr = printErr;
        this.Module = null;
        this.verbose = verbose;
    }
    
    async load() 
    {
        const {print, printErr, verbose} = this;
        const wasm_module = await (WebAssembly.compileStreaming ? this.wasm_module_promise : this.wasm_module_promise.then(r => r.arrayBuffer()));
        const Module =
        {
            thisProgram : '/bin/busybox',
            noInitialRun : true,
            totalDependencies: 0,
            output_stdout : '',
            output_stderr : '',
            output_stdout_binary : [],
            prefix : '',
            input_stdin_binary : [],
            input_stdin_binary_iterator : 0,
            newline : '\n',

            instantiateWasm(imports, successCallback)
            {
                WebAssembly.instantiate(wasm_module, imports).then(output => successCallback(WebAssembly.compileStreaming ? output : output.instance)).catch(err => {throw new Error('Error while initializing BusyBox!\n\n' + err.toString())});
                return {};
            },
            
            stdin()
            {
                const ord = Module.input_stdin_binary[Module.input_stdin_binary_iterator++];
                return ord === undefined ? null : ord;
                //if(Module.input_stdin_binary_iterator >= Module.input_stdin_binary.length)
                //    return null;
            },

            stdout(ord)
            {
                const CR = 0x0D, LF = 0x0A;

                if(Module.newline != '' || ord != LF)
                {
                    Module.output_stdout += String.fromCharCode(ord);
                    Module.output_stdout_binary.push(ord);
                }

                //if(verbose && print) print(Module.thisProgram + ': ' + Module.prefix + ' | stdout: ' + text);
            },
            
            /*print(text) 
            {
                text = (arguments.length > 1 ? Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stdout += text + Module.newline;
                if(verbose && print) print(Module.thisProgram + ': ' + Module.prefix + ' | stdout: ' + text);
            },*/

            printErr(text)
            {
                text = (arguments.length > 1 ?  Array.prototype.slice.call(arguments).join(' ') : text) || '';
                Module.output_stderr += text + Module.newline;
                Module.setStatus(' | stderr: ' + text);
            },
            
            setStatus(text)
            {
                if(printErr) printErr(Module.thisProgram + ': ' + Module.prefix + ' ||| ' + text);
            },
            
            monitorRunDependencies(left)
            {
                this.totalDependencies = Math.max(this.totalDependencies, left);
                if(printErr) Module.setStatus(left ? 'Preparing... (' + (this.totalDependencies-left) + '/' + this.totalDependencies + ')' : 'All downloads complete.');
            },
        };
       
        this.Module = await this.busybox_module_constructor(Module);
        this.Module.FS.mkdir('/etc');
        this.Module.FS.writeFile('/etc/passwd', 'web_user:x:0:0:emscripten:/home/web_user:/bin/false');
        console.assert(this.mem_header_size % 4 == 0 && this.Module.HEAP32.slice(this.mem_header_size / 4).every(x => x == 0));
    }

    run_check(cmd, ...args)
    {
        const res = this.run(cmd, ...args);
        if(res.exit_code != 0)
            throw new Error(`[${cmd[0]}]: non-zero exit code [${res.exit_code}]`);
        return res;
    }

    run(cmd, stdin = '', cwd = '')
    {
        const NOCLEANUP_callMain = (Module, args) =>
        {
            const main = Module._main, fflush = Module._fflush, putchar = Module._putchar, NULL = 0;
            const argc = args.length + 1;
            const argv = Module.stackAlloc((argc + 1) * 4);
            
            // allocating arugments in an address-increasing way to work around OpenBSD's diff bug:
            // https://marc.info/?l=openbsd-bugs&m=160898324728639&w=2
            // https://github.com/emscripten-core/emscripten/issues/13106
            args = [Module.thisProgram].concat(args);
            const lens = args.map(a => Module.lengthBytesUTF8(a));
            Module.HEAP32[argv >> 2] = Module.allocateUTF8OnStack(args.join('\0'));
            for(let i = 1; i < argc; i++)
                Module.HEAP32[(argv >> 2) + i] = Module.HEAP32[(argv >> 2) + i - 1] + lens[i - 1] + 1;
            Module.HEAP32[(argv >> 2) + argc] = NULL;

            try
            {
                main(argc, argv);
            }
            catch(e)
            {
                if(e.status === undefined)
                {
                    Module.printErr(`Unknown error: ${e}`);
                    return -1;
                }

                // workaround for https://github.com/emscripten-core/emscripten/issues/5290#issuecomment-753370693
                Module.newline = '';
                putchar('\n'.charCodeAt());
                fflush(NULL);
                Module.newline = '\n';
                if(this.verbose)
                    Module.setStatus(`Exit code: [${e.status}], message: [${e.message}]`);
                return e.status;
            }
            
            return 0;
        }

        this.Module.output_stdout = '';
        this.Module.output_stderr = '';
        this.Module.output_stdout_binary = [];
                
        this.Module.input_stdin_binary_iterator = 0;
        if(stdin != null)
            this.Module.input_stdin_binary = stdin.constructor === Uint8Array ? stdin : Uint8Array.from(Array.from(stdin).map(c => c.charCodeAt()));
        
        this.Module.prefix = cmd[0];
        const mem_header = Uint8Array.from(this.Module.HEAPU8.slice(0, this.mem_header_size));
        const OLDPWD = this.Module.FS.cwd();
        if(cwd)
            this.Module.FS.chdir(cwd);
        const exit_code = NOCLEANUP_callMain(this.Module, cmd, this.print);
        this.Module.FS.chdir(OLDPWD);
        
        //TODO: need?
        this.Module.FS.quit();
        for(const dev_path of ['/dev/stdin', '/dev/stdout', '/dev/stderr'])
            this.Module.FS.unlink(dev_path);
        this.Module.FS.createStandardStreams();
        //
        
        this.Module.HEAPU8.fill(0);
        this.Module.HEAPU8.set(mem_header);

        return {
            exit_code : exit_code, 
            stdout : (this.Module.output_stdout || ''), 
            stderr : (this.Module.output_stderr || ''), 
            stdout_binary : Uint8Array.from(this.Module.output_stdout_binary),
        };
    }
}

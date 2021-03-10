// tex_path: latexmk, open, project_dir

import { Github } from '/github.js'
import { Busybox } from '/busybox.js'

export class Shell
{
    constructor(monaco, ui, paths, readme, terminal, editor, difftool, cors_proxy_fmt = 'https://cors-anywhere.herokuapp.com/${url}')
    {
        this.monaco = monaco;
        this.share_link_log = '/tmp/share_link.log';
        this.shared_project_tar = '/tmp/shared_project.tar';
        this.shared_project_targz = this.shared_project_tar + '.gz';
        this.home_dir = '/home/web_user';
        this.tmp_dir = '/tmp';
        this.tmp_file = this.tmp_dir + '/tmpfile.bin';
        this.OLDPWD = this.home_dir;
        this.cache_dir = '/cache';
        this.cached_tokens_jsonl = this.cache_dir + '/cached_tokens.jsonl';
        this.tex_ext = '.tex';
        this.readme_dir = this.home_dir + '/readme';
        this.readme_tex = this.readme_dir + '/README.tex';
        this.hello_world = "\\documentclass[11pt]{article}\n\\begin{document}\n\n\\title{Hello}\n\\maketitle\n\n\\section{world}\nindeed!\n\n\\end{document}";

        this.shared_project = '/home/web_user/shared_project';
        this.pdf_path = null;
        this.log_path = null;
        this.edit_path = null;
        this.view_path = null;
        this.tex_path = '';
        this.zip_path = '/tmp/archive.zip';
        this.tar_path = '/tmp/archive.tar';
        this.targz_path = '/tmp/archive.tar.gz';
        this.arxiv_path = '/tmp/arxiv.tar';
        this.git_log = '/tmp/git.log';
        this.new_file_name = 'newfile';
        this.new_file_ext = '.tex';
        this.new_dir_name = 'newfolder';
        this.current_terminal_line = '';
        this.text_extensions = ['.tex', '.bib', '.txt', '.md', '.svg', '.sh', '.py', '.csv'];
        this.busybox_applets = ['busyzip', 'bsddiff3prog', 'bsddiff', 'busybox', 'find', 'mkdir', 'pwd', 'ls', 'echo', 'cp', 'mv', 'rm', 'du', 'tar', 'touch', 'wc', 'cat', 'head', 'clear', 'unzip', 'gzip', 'base64', 'sha1sum', 'whoami', 'sed'];
        this.shell_builtins =  ['man', 'help', 'open', 'close', 'download', 'cd', 'purge', 'latexmk', 'git', 'upload', 'wget', 'init', 'dirty'];
        this.cache_applets = ['object', 'token'];
        this.git_applets = ['clone', 'pull', 'push', 'status', 'difftool'];
        this.viewer_extensions = ['.log', '.svg', '.png', '.jpg', '.pdf'];
        this.shell_commands = [...this.shell_builtins, ...this.busybox_applets, ...this.git_applets.map(cmd => 'git ' + cmd), ...this.cache_applets.map(cmd => 'cache ' + cmd)].sort();
        this.tic_ = 0;
        this.timer_delay_millisec = 1000;
        this.dirty_mode = 'timer_save';
        this.FS = null;
        this.PATH = null;
        this.github = null;
        this.terminal = terminal;
        this.editor = editor;
        this.difftool = difftool;
        this.ui = ui;
        this.paths = paths;
        this.compiler = new Worker(paths.busytex_worker_js);
        this.log_small = this.ui.log_small;
        this.log_big = this.ui.log_big;
        this.readme = readme;
        this.busybox = null;
        this.refresh_cwd = null;
        this.terminal_reset_sequence = '\x1bc';
        this.EXIT_SUCCESS = 0;
        this.tabs = {};
        this.interval_id = 0;
        this.HTTP_OK = 200;
        this.cors_proxy_fmt = cors_proxy_fmt;
        this.cmd = (...parts) => parts.join(' ');
        this.arg = path => this.expandcollapseuser(path, false);
        this.chain = (...cmds) => cmds.join(' && ');
    }

    bind()
    {
        const {cmd, arg, chain} = this;
        const qq = (x = '') => '"' + x + '"', qx = (x = '') => '`' + x + '`';
        
        this.compiler.onmessage = this.oncompilermessage.bind(this);
        this.terminal.onKey(this.onkey.bind(this));

        this.ui.clone.onclick = () => this.commands(chain('cd', cmd('git', 'clone', this.ui.github_https_path.value), cmd('cd', this.PATH.join2('~', this.PATH.basename(this.ui.github_https_path.value))), cmd('open', '.')) );
        this.ui.download_pdf.onclick = () => this.pdf_path && this.commands(cmd('download', arg(this.pdf_path)));
        this.ui.cache_tokenpurge.onclick = () => this.commands(cmd('cache', 'token', 'purge'));
        this.ui.view_log.onclick = () => this.log_path && this.commands(cmd('open', arg(this.log_path)));
        this.ui.view_pdf.onclick = () => this.pdf_path && this.commands(cmd('open', arg(this.pdf_path)));
        this.ui.download.onclick = () => this.edit_path && this.commands(cmd('download', arg(this.edit_path)));
        this.ui.upload.onclick = async () => await this.commands('upload');
        this.ui.import_project.onclick = this.import_project.bind(this);
        this.ui.download_zip.onclick = () => this.commands(chain('cd', cmd('busyzip', '-r', '-x', '.git', this.zip_path, this.PATH.basename(this.project_dir())), cmd('cd', '-'), cmd('download', arg(this.zip_path))));
        
        this.ui.download_targz.onclick = () => this.commands(chain(cmd('tar', '-C', arg(this.PATH.dirname(this.project_dir())), '-cf', this.tar_path,  '--exclude', '.git', this.PATH.basename(this.project_dir())), cmd('gzip', arg(this.tar_path)), cmd('download', arg(this.targz_path))));
       
        this.ui.strip_comments.onclick = () => this.commands(cmd( 'sed', '-i', '-e', qq('s/^\\([^\\]*\\)\\(\\(\\\\\\\\\\)*\\)%.*/\\1\\2%/g'), qx('find ' + arg(this.project_dir()) + ' -name ' + qq('*.tex') )));
        this.ui.compile_project.onclick = () => this.commands(cmd('latexmk', arg(this.ui.get_current_tex_path())));
        this.ui.compile_current_file.onclick = () => (this.ui.get_current_file() || '').endsWith('.tex') && this.commands(cmd('latexmk', arg(this.ui.get_current_file())));
        this.ui.man.onclick = () => this.commands('man');
        this.ui.share.onclick = () => this.commands(chain(cmd('tar', '-C', arg(this.PATH.dirname(this.project_dir())), '-cf', this.shared_project_tar, this.PATH.basename(this.project_dir())), cmd('gzip', this.shared_project_tar), cmd('echo', '-n', this.ui.get_origin() + '/#base64targz/', '>', this.share_link_log), cmd('base64', '-w', '0', this.shared_project_targz, '>>', this.share_link_log), cmd('open', arg(this.share_link_log))));

        this.ui.new_file.onclick = () =>
        {
            const new_path = this.new_file_path(this.new_file_name, this.new_file_ext);
            this.commands(chain(cmd('echo', '-e', qq(this.hello_world.replaceAll('\\', '\\\\').replaceAll('\n', '\\n')), '>', new_path), cmd('open', new_path)));
        }
        this.ui.new_folder.onclick = () => 
        {
            const new_path = this.new_file_path(this.new_dir_name);
            this.commands(chain(cmd('mkdir', new_path), cmd('open', new_path)));
        }

        this.ui.pull.onclick = () => this.commands(cmd('git', 'pull'));
        this.ui.github_https_path.onkeypress = this.ui.github_token.onkeypress = ev => ev.key == 'Enter' ? this.ui.clone.click() : null;
        this.ui.filetree.onchange = ev => console.log('onchange', this.ui.get_selected_file_path()) || this.open(this.expandcollapseuser(this.ui.get_selected_file_path() || '', false));
        this.ui.filetree.ondblclick = ev =>
        {
            const option = ev.target;
            if(this.ui.isdir(option))
            {
                const samedir = option.text == '.', parentdir = option.text == '..';
                if(samedir)
                    this.refresh();
                else
                    this.commands(parentdir ? chain(cmd('open', '..'), cmd('cd', '..')) : chain(cmd('cd', arg(option.value)), cmd('open', '.')));
            }
        };
        this.ui.filetree.onkeydown = ev => ev.key == 'Enter' || ev.key == ' ' ? this.ui.filetree.ondblclick() : null;
        this.ui.current_file.onclick = () => this.ui.toggle_current_file_rename() || this.ui.current_file_rename.focus();
        
        this.ui.current_file_rename.onblur = () => this.ui.set_current_file(this.ui.get_current_file()) || this.ui.toggle_current_file_rename();
        this.ui.current_file_rename.onkeydown = ev => ev.key == 'Enter' ? (this.mv(this.ui.get_current_file(), this.ui.current_file_rename.value) || this.ui.set_current_file(this.ui.current_file_rename.value) || this.ui.toggle_current_file_rename()) : ev.key == 'Escape' ? ev.target.onblur() : null;
        
        this.ui.remove.onclick = () => this.ui.get_current_file() && this.commands(chain(this.isdir(this.ui.get_current_file()) ? cmd('rm', '-rf', this.ui.get_current_file()) : cmd('rm', this.ui.get_current_file()), cmd('open', '.'))); 
        
		
        this.editor.onDidFocusEditorText(ev => this.ui.set_current_file(this.PATH.basename(this.edit_path), this.edit_path, 'editing'));
        this.ui.txtpreview.onfocus = this.ui.imgpreview.onclick = () => this.ui.set_current_file(this.PATH.basename(this.view_path), this.view_path, 'viewing');
        //this.ui.pdfpreview.onclick = ev => console.log('pdfpreview', ev);
		this.editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyCode.Enter, this.ui.compile_current_file.onclick);
		this.editor.addCommand(this.monaco.KeyMod.CtrlCmd | this.monaco.KeyMod.ShiftCmd | this.monaco.KeyCode.Enter, this.ui.compile_project.onclick);
		this.difftool.addCommand(this.monaco.KeyCode.Escape, () => this.ui.toggle_editor('editor'), '!findWidgetVisible && !inReferenceSearchEditor && !editorHasSelection'); 
    }

    new_file_path(prefix, ext = '', max_attempts = 1000)
    {
        for(let i = 0; i < max_attempts; i++)
        {
            const path = prefix + (i == 0 ? '' : i.toString()) + ext;
            if(!this.exists(path))
                return path;
        }
        throw new Error(`Cannot create new [${prefix}{ext}]`);
    }

    exists(path)
    {
        return this.FS.analyzePath(path).exists;
    }

    abspath(path)
    {
        return path.startsWith('/') ? path : this.PATH.normalize(this.PATH.join2(this.FS.cwd(), path));
    }

    isdir(path)
    {
        return this.exists(path) && this.FS.isDir(this.FS.lookupPath(path).node.mode);
    }

    dirty(mode)
    {
        if(mode == 'timer_save')
        {
            this.dirty('timer_off');
            this.interval_id = self.setInterval(this.tabs_save, this.timer_delay_millisec, this);
            this.dirty_mode = mode;
        }
        if(mode == 'timer_load')
        {
            this.dirty('timer_off');
            this.interval_id = self.setInterval(this.tabs_load, this.timer_delay_millisec, this);
            this.dirty_mode = mode;
        }
        else if(mode == 'timer_off')
        {
            self.clearInterval(this.interval_id);
            this.interval_id = 0;
            this.dirty_mode = mode;
        }

        return this.dirty_mode;
    }

    tic()
    {
        this.tic_ = performance.now();
    }

    toc()
    {
        if(this.tic_ > 0)
        {
            const elapsed = (performance.now() - this.tic_) / 1000.0;
            this.log_small(`Elapsed time: ${elapsed.toFixed(2)} sec`);
            this.tic_ = 0.0;
        }
    }

    async type(cmd)
    {
        for(const c of cmd)
            await this.onkey({key : c, domEvent: {key : null}});
        await this.onkey({key : '', domEvent: {key : 'Enter'}});
    }

    terminal_print(line, newline = '\r\n')
    {
        this.terminal.write((line || '') + newline);
    }

    terminal_prompt(red_begin_sequence = '\x1B[1;3;31m', red_end_sequence = '\x1B[0m')
    {
        return this.terminal.write(`${red_begin_sequence}busytex${red_end_sequence}:` + this.pwd(true) + '$ ');
    }
    
    async onkey({key, domEvent})
    {
        if(domEvent.key == 'Backspace')
        {
            if(this.current_terminal_line.length > 0)
            {
                this.current_terminal_line = this.current_terminal_line.slice(0, this.current_terminal_line.length - 1);
                this.terminal.write('\b \b');
            }
        }
        else if(domEvent.key == 'Enter')
        {
            this.terminal_print();
            await this.shell(this.current_terminal_line);
            this.terminal_prompt();
            this.current_terminal_line = '';
        }
        else
        {
            this.current_terminal_line += key;
            this.terminal.write(key);
        }
    }
    
    async commands(...cmds)
    {
        this.tabs_save(this);
        this.dirty('timer_off');

        this.old_terminal_line = this.current_terminal_line;
        this.current_terminal_line = '';
        this.terminal.write('\b'.repeat(this.old_terminal_line.length));
        for(const cmd of cmds)
            await this.type(cmd);
        this.terminal.write(this.old_terminal_line);
        this.refresh();
       
        this.tabs_load(this);
        this.dirty('timer_save');
    }

    async shell(current_terminal_line)
    {
        const toString = arg =>
        {
            if(arg === '' || arg === null || arg === undefined)
                return '';
            else if(arg === true)
                return 'ok!';
            else if(arg === false)
                return 'error!';
            else if(typeof(arg) == 'string')
                return arg;
            else if(typeof(arg) == 'number')
                return arg.toString();
            else if(Array.isArray(arg))
                return arg.map(toString).join('\t');
            else
            {
                console.log('Exit code:', arg.exit_code);
                console.log('Stdout orig:', arg.stdout.length, '[', arg.stdout, ']');
                let res = arg.stdout.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n');
                //if(res.length > 0 && res[res.length - 1] != '\n')
                //    res += '\r\n';
                console.log('Stdout repl:', res.length, '[', res, ']');
                return res;
            };
        };

        const parse_cmdline = current_terminal_line =>
        {
            let cmds = [];
            for(let cmdline of current_terminal_line.split('&&'))
            {
                let stdout_redirect = null, stdout_redirect_append = null;
                if(cmdline.includes('>>'))
                    [cmdline, stdout_redirect_append] = cmdline.split('>>');
                else if(cmdline.includes('>'))
                    [cmdline, stdout_redirect] = cmdline.split('>');

                let [cmd, ...args] = cmdline.trim().split(' ');
                args = args.map(a => this.expandcollapseuser(a));
                args = args.map(a => a.startsWith('"') ? a.slice(1) : a).map(a => a.endsWith('"') ? a.slice(0, a.length - 1) : a);

                cmds.push({cmd : cmd, args : args, stdout_redirect : stdout_redirect, stdout_redirect_append : stdout_redirect_append, subcommand : false});
            }

            for(const c of cmds)
            {
                let argsqx = [], argsqq = [], join = false;

                for(const a of c.args)
                {
                    if(join)
                        argsqx[argsqx.length - 1] += ' ' + a;
                    else
                        argsqx.push(a);

                    if(a.includes('`'))
                        join = !join;
                }
                join = false;
                c.args = argsqx;

                for(const a of c.args)
                {
                    if(join)
                        argsqq[argsqq.length - 1] += ' ' + a;
                    else
                        argsqq.push(a);

                    if((!a.includes('`')) && (a.startsWith('"') ^ a.endsWith('"')))
                        join = !join;
                }
                join = false;
                c.args = argsqq;
            }
            return cmds;
        };


        const expand_subcommand_args = (args, run_busybox_cmd = c => this.busybox.run([c.cmd, ...c.args]).stdout.trim().replaceAll('\n', ' ')) => args.map(a => a.includes('`') ? run_busybox_cmd(parse_cmdline(a.slice(1, a.length - 1))[0]).split(' ') : [a]).flat();

        const chained_commands = parse_cmdline(current_terminal_line);

        for(let {cmd, args, stdout_redirect, stdout_redirect_append} of chained_commands)
        {
            args = expand_subcommand_args(args);

            let print_or_dump = (arg, ...args) => arg && this.terminal_print(toString(arg), ...args);

            if(stdout_redirect_append)
            {
                print_or_dump = arg => 
                {
                    const f = this.FS.open(stdout_redirect_append.trim(), 'a');
                    this.FS.write(f, arg.stdout_binary, 0, arg.stdout_binary.length);
                    this.FS.close(f);
                }
            }
            else if(stdout_redirect)
            {
                print_or_dump = arg => this.FS.writeFile(stdout_redirect.trim(), arg.stdout_binary);
            }

            const route = this.ui.get_route();
            if(route.length > 1)
                args = args.map(a => a.replace('$URLARG', route[1]));
            
            try
            {
                if (cmd == '')
                {
                }
                else if(this.busybox_applets.includes(cmd))
                    print_or_dump(this.busybox.run([cmd, ...args]), '');
                else if(cmd == 'tabs')
                    print_or_dump(Object.keys(this.tabs).sort());
                else if(cmd == 'help')
                    print_or_dump(this.shell_commands);
                else if(cmd == 'git' && args.length == 0)
                    print_or_dump(this.git_applets);

                else if(cmd == 'git' && args.length > 0 && this.git_applets.includes(args[0]))
                    await this['git_' + args[0]](...args.slice(1));

                else if(cmd == 'cache' && args.length > 0 && this.cache_applets.includes(args[0]))
                    print_or_dump(await this['cache_' + args[0]](...args.slice(1)));
                else if(this.shell_builtins.includes(cmd))
                    print_or_dump(await this[cmd](...args));
                else
                    this.terminal_print(cmd + ': command not found');
            }
            catch(err)
            {
                this.terminal_print('Error: ' + err.message);
            }
        }
    }

    async wget(url, _OP = '-O', output_path = null)
    {
        output_path = _OP == '-P' ? this.PATH.join2(output_path, this.PATH.basename(url)) : (output_path || this.PATH.basename(url));
        const proxy_path = this.cors_proxy_fmt.replace('${url}', url);
        const resp = await fetch(proxy_path, {headers : {'X-Requested-With': 'XMLHttpRequest'}});
        console.assert(this.HTTP_OK == resp.status);
        const uint8array = new Uint8Array(await resp.arrayBuffer());
        this.FS.writeFile(output_path, uint8array);
    }

    inline_clone(serialized)
    {
        const files = this.deserialize_project(serialized);
        project_dir = this.shared_project;
        this.FS.mkdir(project_dir)

        let dirs = new Set(['/', project_dir]);
        for(const {path, contents} of files.sort((lhs, rhs) => lhs['path'] < rhs['path'] ? -1 : 1))
        {
            const absolute_path = this.PATH.join2(project_dir, path);
            if(contents == null)
                this.mkdir_p(absolute_path, dirs);
            else
            {
                this.mkdir_p(this.PATH.dirname(absolute_path));
                this.FS.writeFile(absolute_path, contents);
            }
        }
        return project_dir;
    }

    async init(route0, route1)
    {
        let project_dir = null;
        let cmds = [];
        
        if(route0 == 'github')
        {
            this.ui.github_https_path.value = route1;
            project_dir = this.github.parse_url(this.ui.github_https_path.value).reponame;
            cmds = [this.cmd('git', 'clone', this.ui.github_https_path.value), this.cmd('cd', project_dir), this.cmd('open', '.')];
        }
        else if(route0 == 'arxiv')
        {
            const arxiv_https_path = route1.replace('/abs/', '/e-print/');
            project_dir = this.PATH.join2('~', this.PATH.basename(arxiv_https_path));
            cmds = [this.cmd('wget', arxiv_https_path, '-O', this.arxiv_path), this.cmd('mkdir', project_dir), this.cmd('tar', '-xf', this.arxiv_path, '-C', project_dir), this.cmd('cd', project_dir), this.cmd('open', '.')];
        }
        else if(route0 == 'archive')
        {
            const file_https_path = route1;
            const basename = this.PATH.basename(file_https_path);
            const file_path = this.PATH.join2(this.tmp_dir, basename);
            project_dir = this.PATH.join2('~', basename.slice(0, basename.indexOf('.')));
            
            let download_cmds = [];
            if(this.exists(file_https_path))
                file_path = file_https_path;
            else
                download_cmds = [this.cmd('wget', file_https_path, '-O', file_path)]
            const decompress_cmds = file_https_path.endsWith('.tar.gz') ? [this.cmd('gzip', '-d', file_path), this.cmd('tar', '-xf', file_path.replace('.gz', ''), '-C', project_dir)] : file_https_path.endsWith('.zip') ? [this.cmd('unzip', file_path, '-d', project_dir)] : []; 

            cmds = [...download_cmds, this.cmd('mkdir', project_dir), ...decompress_cmds, this.cmd('cd', project_dir), this.cmd('open', '.')];
        }
        else if(route0 == 'file')
        {
            const path = route1;
            const basename = this.PATH.basename(path);
            const file_path = this.PATH.join2(this.tmp_dir, basename);
            project_dir = this.PATH.join2('~', basename.slice(0, basename.indexOf('.')));
            cmds = [this.cmd('mkdir', project_dir), path.startsWith('http://') || path.startsWith('https://') ? this.cmd('wget', path, '-P', project_dir) : this.cmd('cp', path, project_dir), this.cmd('cd', project_dir), this.cmd('open', '.')];
        }
        else if(route0 == 'base64targz')
        {
            project_dir = '~';
            cmds = [this.cmd('echo', '$URLARG', '>', this.share_link_log), this.cmd('base64', '-d', this.share_link_log, '>', this.shared_project_targz), this.cmd('gzip', this.shared_project_targz), 'cd', this.cmd('tar', '-xf', this.share_project_tar), this.cmd('open', '.')];
        }

        if(cmds)
            await this.commands(this.chain(...cmds));
    }

    async run(busybox_module_constructor, busybox_wasm_module_promise)
    {
        this.compiler.postMessage(this.paths);
        this.busybox = new Busybox(busybox_module_constructor, busybox_wasm_module_promise, this.log_small.bind(this));
        
        await this.busybox.load()
        
        this.PATH = this.busybox.Module.PATH;
        this.FS = this.busybox.Module.FS;
        this.FS.mkdir(this.readme_dir);
        this.FS.mkdir(this.cache_dir);
        this.FS.mount(this.FS.filesystems.IDBFS, {}, this.cache_dir);
        this.FS.writeFile(this.readme_tex, this.readme);
        this.FS.chdir(this.home_dir);
        const sha1 = uint8array => this.busybox.run(['sha1sum'], uint8array).stdout.substring(0, 40);
        this.github = new Github(this.cache_dir, this.merge.bind(this), this.log_big.bind(this), sha1, this.FS, this.PATH, this);
        
        await this.cache_load();
       
        const route = this.ui.get_route();
       
        this.terminal_prompt();
        if(route.length > 1)
            await this.init(...route);
        else
            await this.commands('man');

        this.bind();
        this.dirty('timer_save');
    }
   
    log_big_header(text = '')
    {
        this.log_big(this.ui.log_reset_sequence);
        this.ui.toggle_viewer('log', text + '\n');
    }

    async git_clone(https_path)
    {
        this.log_big_header('$ git clone ' + https_path); 
        const parsed = this.github.parse_url(https_path);
        
        let repo_path = parsed.reponame;
        this.log_path = this.git_log;
        
        this.log_big(`Cloning from '${https_path}' into '${repo_path}'...`);
        
        let token_cached = false;
        let token = this.ui.github_token.value;
        if(token == '')
        {
            this.log_big(`Searching token cache for '${https_path}'...`);
            token = await this.cache_token('get', https_path);
            this.ui.github_token.value = token;
            token_cached = token != '';
            this.log_big(token_cached ? `Token found [${token}] in cache...` : 'Token not found in cache...');
        }

        token = token || this.ui.github_token.value;
        
        if(parsed.gist)
        {
            await this.github.clone_gist(token, https_path, repo_path);
        }
        else
        {
            await this.github.clone_repo(token, https_path, repo_path);
        }
        
        if(!token_cached && token != '')
        {
            this.log_big(`Caching for '${https_path}' token [${token}]...`);
            await this.cache_token('add', https_path, token);
        }
        
        await this.cache_save();
        this.ui.set_route('github', https_path);
        
        return repo_path;
    }

    git_status()
    {
        const status = this.github.status();
        this.ui.update_git_status(status, this.github.format_url, this.git_difftool.bind(this), this.open.bind(this));
        this.ui.toggle_viewer('gitstatus');
    }

    git_difftool(file_path)
    {
        const abspath = this.abspath(file_path);

        const modified = this.FS.readFile(abspath, {encoding: 'utf8'});
        if(!this.tabs[abspath])
            this.tabs[abspath] = this.monaco.editor.createModel(modified, undefined, this.monaco.Uri.file(abspath));
        const modified_model = this.tabs[abspath];
        
        const original = this.github.cat_file(abspath);
        const original_model = this.monaco.editor.createModel(original, modified_model.getLanguageIdentifier().language);
        // TODO: register original_model in tabs

        this.difftool.setModel({original: original_model, modified: modified_model});

        this.ui.toggle_editor('difftool');
        this.difftool.focus();
    }

    async git_pull()
    {
        //const status = await this.github.pull();
        //this.ui.update_git_pull(status.filter(f => f.status != not_modified), status.filter(f => f.status == not_modified));
        this.ui.toggle_viewer('gitpull');
    }
    
    async git_push(...args)
    {
        this.log_big_header('$ git push');
        return await this.github.push_gist(...args);
    }

    async cache_load()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(true, x => x == null ? resolve(true) : reject(false)));
    }
    
    async cache_save()
    {
        return new Promise((resolve, reject) => this.FS.syncfs(false, x => x == null ? resolve(true) : reject(false)));
    }

    async cache_object(cmd)
    {
        if(cmd == 'purge')
        {
            const cached_files = this.FS.readdir(this.cache_dir);
            for(const file_name of cached_files)
                if(file_name != '.' && file_name != '..')
                    this.FS.unlink(this.PATH.join2(this.cache_dir, file_name));
            await this.cache_save();
        }
    }

    async cache_token(cmd, github_https_path, token)
    {
        if(cmd == 'purge')
        {
            this.FS.unlink(this.cached_tokens_jsonl);
            await this.cache_save();
        }
        else if(cmd == 'ls')
        {
            const content = this.exists(this.cached_tokens_jsonl) ? this.FS.readFile(this.cached_tokens_jsonl, {encoding: 'utf8'}) : '';
            if(github_https_path != false)
                return content;
            else
                return content != '' ? content.split('\n').filter(s => s != '').map(s => JSON.parse(s)) : [];
        }
        else if(cmd == 'add')
        {
            const parsed = {token: token, ...this.github.parse_url(github_https_path)};
            this.FS.writeFile(this.cached_tokens_jsonl, (await this.cache_token('ls')) + JSON.stringify(parsed) + '\n');
            await this.cache_save();
        }
        else if(cmd == 'get')
        {
            const parsed = this.github.parse_url(github_https_path);
            const tokens = await this.cache_token('ls', false);
            const good = tokens.filter(t => t.username == parsed.username);
            if(good.length > 0)
                return good[0].token;
            return '';

            // for gist:
            // 1. username+reponame+[gist=true]
            // 2. username+[gist=true]
            // 3. username+[gist=false]
            // 4. [gist=true]
            // for non-gist:
            // 1. username+reponame+[gist=false]
            // 2. username
            // 3. [gist=true]
        }
    }

    oncompilermessage(e)
    {
        const {pdf, log, print} = e.data;
        if(pdf)
        {
            this.toc();
            this.mkdir_p(this.PATH.dirname(this.pdf_path));
            this.FS.writeFile(this.pdf_path, pdf);
            this.open(this.pdf_path, pdf);
        }
        if(log)
        {
            this.toc();
            this.mkdir_p(this.PATH.dirname(this.log_path));
            this.FS.writeFile(this.log_path, log);
        }
        if(print)
        {
            this.log_small(print);
        }
    }

    project_dir(cwd = null)
    {
        if(!cwd)
            cwd = this.ui.get_current_tex_path() ? this.PATH.dirname(this.ui.get_current_tex_path()) : this.FS.cwd();

        const project_dir = cwd.split('/').slice(0, 4).join('/');
        return project_dir;
    }

    project_tmp_dir()
    {
        return this.project_dir().replace(this.home_dir, this.tmp_dir);
    }

    open_find_default_path(file_path)
    {
        const tex_files = this.find(file_path, '', false).filter(f => f.contents != null && f.path.endsWith(this.tex_ext));
        let default_path = null;
        if(tex_files.length == 1)
            default_path = tex_files[0].path;
        else if(tex_files.length > 1)
        {
            const main_tex_files = this.find(file_path, '', false).filter(f => f.contents != null && f.path.endsWith(this.tex_ext) && f.path.includes('main'));
            default_path = main_tex_files.length > 0 ? main_tex_files[0].path : tex_files[0].path;
        }
        if(default_path == null)
        {
            const text_files = this.find(file_path, '', false).filter(f => f.contents != null && this.text_extensions.map(ext => f.path.endsWith(ext)).includes(true));
            if(text_files.length == 1)
                default_path = text_files[0].path;
            else if(text_files.length > 1)
            {
                const main_text_files = this.find(file_path, '', false).filter(f => f.contents != null && f.path.toUpperCase().includes('README'));
                default_path = main_text_files.length > 0 ? main_text_files[0].path : text_files[0].path;
            }
        }
        return default_path;
    }

    close(file_path)
    {
        if(!file_path)
            file_path = this.edit_path;

        if(!file_path)
            return;

        const abspath = this.abspath(file_path);
        
        if(this.edit_path == abspath)
            this.open('');

        if(abspath in this.tabs)
        {
            this.tabs[abspath].dispose();
            delete this.tabs[abspath];
        }
    }

    ls_la(abspath, file_path)
    {
        this.log_big_header('$ ls -la ' + this.arg(abspath));
        this.log_big(this.busybox.run(['ls', '-la', file_path]).stdout);
    }

    open(file_path, contents, readonly)
    {
        // readonly https://github.com/microsoft/monaco-editor/issues/54
        const open_editor_tab = (file_path, contents = '') =>
        {
            let abspath = file_path == '' ? '' : this.abspath(file_path);
            this.edit_path = abspath;
            if(!(abspath in this.tabs))
                this.tabs[abspath] = this.monaco.editor.createModel(contents, undefined, this.monaco.Uri.file(abspath));

            const editor_model = this.tabs[abspath];
            editor_model.setValue(contents);
            this.editor.setModel(editor_model);
            //var currentState = this.editor.saveViewState();
            //this.editor.restoreViewState(data[desiredModelId].state);
            //this.editor.focus();

            this.ui.toggle_editor('editor');
        };

        const open_viewer_tab = (file_path, contents) =>
        {
            const abspath = file_path == '' ? '' : this.abspath(file_path);
            this.view_path = abspath;
            this.ui.toggle_viewer(this.PATH.extname(file_path).slice(1), contents);
        };

        if(file_path === null)
            file_path = '.';
        
        if(file_path === '')
        {
            this.tex_path = '';
            this.ui.set_current_file('');
            open_editor_tab('');
            this.ui.toggle_viewer('log', '');
            return;
        }
        else if(file_path != null)
        {
            file_path = this.expandcollapseuser(file_path);

            if(file_path != null && this.isdir(file_path))
            {
                const abspath = this.abspath(file_path);
                const basename = this.PATH.basename(abspath);
                const default_path = file_path == '.' ? this.open_find_default_path(file_path) : null;
                console.log('open default_path', default_path);
                
                contents = null;
                
                if(default_path == null)
                {
                    console.log('open', 'default_path', default_path, 'basename', basename, 'file_path', abspath);
                    this.ui.set_current_file(basename, abspath, 'viewing');

                    if(basename == '.git')
                        this.git_status();
                    else
                    {
                        this.ls_la(abspath, file_path);
                        
                        if(file_path != '.')
                            open_editor_tab('');
                    }
                    
                    file_path = null;
                    return;
                }
                else
                {
                    this.ls_la(abspath, file_path);

                    file_path = this.PATH.join2(file_path, default_path);
                    this.refresh(file_path);
                }
            }
        }

        if(file_path == null && contents == null)
            return;

        const abspath = this.abspath(file_path);
        const basename = this.PATH.basename(abspath);
        const extname = this.PATH.extname(abspath);
        
        if(extname == '.tex')
            this.tex_path = abspath; // file_path.startsWith('/') ? file_path : (this.FS.cwd() + '/' + file_path);

        if(this.viewer_extensions.includes(extname))
        {
            contents = contents || (extname == '.log' ? this.read_all_text(abspath) : this.read_all_bytes(abspath));
            open_viewer_tab(abspath, contents);
            
            this.ui.set_current_file(basename, abspath, 'viewing');
        }
        else
        {
            contents = contents || this.read_all_text(abspath);
            open_editor_tab(abspath, contents);
            
            this.ui.set_current_file(basename, abspath, 'editing');
        }
    }

    read_all_text(path)
    {
        return this.FS.readFile(path, {encoding : 'utf8'});
    }

    read_all_bytes(path)
    {
        return this.FS.readFile(path, {encoding : 'binary'});
    }

    tabs_save(busyshell)
    {
        for(const abspath in busyshell.tabs)
            if(abspath != '')
                busyshell.FS.writeFile(abspath, busyshell.tabs[abspath].getValue());
        busyshell.ui.set_dirty(false);
    }
    
    tabs_load(busyshell)
    {
        for(const abspath in busyshell.tabs)
        {
            if(abspath != '')
            {
                const editor_model = busyshell.tabs[abspath];
                const value = editor_model.getValue();
                const read = busyshell.read_all_text(abspath);

                if(value != read)
                {
                    editor_model.setValue(read);
                    this.editor.setModel(editor_model);
                }
            }
        }
        busyshell.ui.set_dirty(false);
    }

    man()
    {
        this.mkdir_p(this.readme_dir);
        this.FS.writeFile(this.readme_tex, this.readme);

        this.cd(this.readme_dir, true);
        this.open(this.readme_tex);
        this.refresh(this.readme_tex);
    }
   
    async latexmk(tex_path)
    {
        let cwd = this.FS.cwd();
        //if(!tex_path)
        //{
        //    const basename = this.tex_path.lastIndexOf('/');
        //    [cwd, tex_path] = [this.tex_path.slice(0, basename), this.tex_path.slice(1 + basename)];
        //}
        
        if(tex_path.length == 0)
            return;
        
        const verbose = this.ui.verbose.value, tex_driver = this.ui.tex_driver.value;

        this.terminal_print(`Running in background (verbosity = [${verbose}], TeX driver = [${tex_driver}])...`);
        this.tic();
        this.pdf_path = tex_path.replace('.tex', '.pdf').replace(this.project_dir(), this.project_tmp_dir());
        this.log_path = tex_path.replace('.tex', '.log').replace(this.project_dir(), this.project_tmp_dir());
        
        console.assert(tex_path.endsWith('.tex'));
        console.assert(cwd.startsWith(this.home_dir));
        
        const project_dir = this.project_dir(cwd);
        const source_path = tex_path.startsWith('/') ? tex_path : this.PATH.join2(cwd, tex_path);
        const main_tex_path = source_path.slice(project_dir.length + 1);

        this.compiler.postMessage({files : this.find(project_dir), main_tex_path : main_tex_path, verbose : verbose, driver : tex_driver});
    }

    async import_project()
    {
        const extname_archive = ['.tar', '.tar.gz', '.zip'], extname_file = ['.tex', '.bib'];
        const paths = await this.upload(this.tmp_dir, [...extname_archive, ...extname_file]);
        if(paths.length == 0)
            return;

        const path = paths[0];
        const extname = this.PATH.extname(path);
        await this.commands(this.cmd('init', extname_archive.includes(extname) ? 'archive' : 'file', path));
    }

    async upload(file_path = null, ext = [])
    {
        const upload_file = file =>
        {
            const src_name = file.name;
            const dst_path = this.isdir(file_path) ? this.PATH.join2(file_path, src_name) : (file_path || src_name);
            return new Promise((resolve, reject) => 
            {
                const reader = new FileReader();
                reader.onloadend = ev => {
                    this.FS.writeFile(dst_path, new Uint8Array(reader.result));
                    resolve(dst_path);
                }
                reader.readAsArrayBuffer(file);
            });
        };
        
        const fileupload = this.ui.fileupload;
        if(file_path != null)
            fileupload.removeAttribute('multiple');
        else
            fileupload.setAttribute('multiple', 'true');
        if(ext.length == 0)
            fileupload.removeAttribute('accept');
        else
            fileupload.setAttribute('accept', ext.join(','));
        return new Promise((resolve, reject) =>
        {
            fileupload.onchange = async () =>
            {
                const uploads = Array.from(fileupload.files).map(file => upload_file(file));
                const paths = await Promise.all(uploads);
                resolve(paths);
            };
            fileupload.click();
        });
    }

    download(file_path, mime)
    {
        if(!this.FS.analyzePath(file_path).exists)
            return;

        mime = mime || 'application/octet-stream';
        let content = this.FS.readFile(file_path);
        this.ui.create_and_click_download_link(this.PATH.basename(file_path), content, mime);
    }
    
    merge(ours_path, theirs_path, parent_path, df13_diff = '/tmp/df13.diff', df23_diff = '/tmp/df23.diff', conflict_left = '<<<<<<<', conflict_right = '>>>>>>>')
    {
        const [f1, f2, f3] = [ours_path, parent_path, theirs_path];
        this.FS.writeFile(df13_diff, this.busybox.run(['bsddiff', f1, f3]).stdout_binary);
        this.FS.writeFile(df23_diff, this.busybox.run(['bsddiff', f2, f3]).stdout_binary);
        const edscript = this.busybox.run(['bsddiff3prog', '-E', df13_diff, df23_diff, f1, f2, f3]).stdout + 'w';
        this.busybox.run(['ed', ours_path], edscript);
        return edscript.includes(conflict_left) && edscript.includes(conflict_right);
    }

    find(root = '.', relative_dir_path = '', recurse = true, preserve_directories = false, include_dot_directories = false, read_contents_as_string = true, exclude = ['.git'])
    {
        let entries = [];
        if(include_dot_directories)
        {
            const abspath = this.abspath(root);
            entries.push({ path : relative_dir_path || root, name : '.', abspath : abspath });

            if(abspath != '/')
                entries.push({ path : this.PATH.dirname(relative_dir_path || root), name : '..', abspath : this.PATH.normalize(this.PATH.join2(root, '..')) });
        }
        const absolute_dir_path = this.expandcollapseuser(this.PATH.join2(root, relative_dir_path))
        for(const [name, entry] of Object.entries(this.FS.lookupPath(absolute_dir_path, {parent : false}).node.contents))
        {
            const relative_path = relative_dir_path ? this.PATH.join2(relative_dir_path, name) : name;
            const absolute_path = this.expandcollapseuser(this.PATH.join2(root, relative_path));
            if(entry.isFolder)
            {
                if(!exclude.includes(name))
                {
                    if(preserve_directories)
                        entries.push({path : relative_path, abspath : absolute_path, name : name});
                    if(recurse)
                        entries.push(...this.find(root, relative_path, recurse, preserve_directories, include_dot_directories, read_contents_as_string, exclude));
                }
            }
            else if(absolute_path != this.log_path && absolute_path != this.pdf_path)
            {
                entries.push({path : relative_path, abspath : absolute_path, name : name, contents : this.FS.readFile(absolute_path, {encoding : read_contents_as_string && this.text_extensions.map(ext => absolute_path.endsWith(ext)).includes(true) ? 'utf8' : 'binary'})});
            }
        }
        return entries;
    }

    refresh(selected_file_path = null)
    {
        console.log('refresh', '[', selected_file_path, ']');
        selected_file_path = selected_file_path || (this.FS.cwd() == this.refresh_cwd && this.ui.filetree.selectedIndex >= 0 ? this.ui.filetree.options[this.ui.filetree.selectedIndex].value : null);
        console.log('refresh', '(', selected_file_path, ')');
        this.ui.update_file_tree(this.find(this.pwd(), '', false, true, true, true, []), selected_file_path);

        this.ui.update_tex_paths(this.find(this.project_dir(), '', false, true, true, true, []).filter(f => f.path.endsWith('.tex')), selected_file_path);

        for(const abspath in this.tabs)
        {
            if(!this.exists(abspath))
            {
                this.tabs[abspath].dispose();
                delete this.tabs[abspath];
            }
        }

        this.refresh_cwd = this.FS.cwd();
    }

    cd(path, refresh = true)
    {
        if(path == '-')
            path = this.OLDPWD;

        this.OLDPWD = this.FS.cwd();
        path = this.expandcollapseuser(path || '~');
        this.FS.chdir(path);

        if(refresh)
            this.refresh(this.FS.cwd() != this.OLDPWD ? this.FS.cwd() : null);
    }

    pwd(replace_home)
    {
        const cwd = this.FS ? this.FS.cwd() : this.home_dir;
        return replace_home == true ? cwd.replace(this.home_dir, '~') : cwd;    
    }
    
    expandcollapseuser(path, expand = true)
    {
        return expand ? path.replace('~', this.home_dir) : path.replace(this.home_dir, '~');
    }
    
    mkdir_p(dirpath, dirs = new Set(['/']))
    {
        if(!dirs.has(dirpath) && !this.FS.analyzePath(dirpath).exists)
        {
            this.mkdir_p(this.PATH.dirname(dirpath), dirs);
            this.FS.mkdir(dirpath);
            dirs.add(dirpath);
        }
    }

    mv(src_file_path, dst_file_path)
    {
        const src_abspath = this.abspath(src_file_path), dst_abspath = this.abspath(dst_file_path);
        if(src_abspath == dst_abspath)
            return;

        this.dirty('timer_off');
        this.FS.rename(src_file_path, dst_file_path);
        if(this.tabs[dst_abspath])
            this.tabs[dst_abspath].dispose();
        this.tabs[dst_abspath] = this.tabs[src_abspath];
        delete this.tabs[src_abspath];
        this.refresh();
        this.dirty('timer_save');
    }
}


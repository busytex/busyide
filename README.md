# Key Features
- Fully client-side functioning, including project compilation and GitHub integration
- Syntax highlighting
- GitHub integration for both repositories and gists
- Importing papers' LaTeX sources from arxiv.org
- Removing comments for preparing paper submissions
- Project export as ZIP, TAR.GZ
- Installing TexLive packages in one click
- Three TeX drivers: PdfTeX, XeTeX, LuaTeX
- Supports bibtex
- High hackability and minimal codebase size

# GitHub integration
- Both repositories and gists
- Clone
- Push
- Pull
- Publish PDF to Releases

# Features of BusyTex and detailed comparison with Overleaf
### GitHub integration
- BusyTeX has client-side integration with GitHub. This means, you clone the latest version of GitHub repo and branch when you start a BusyTeX session and then you upload updates to GitHub in form of Git commits. GitHub integration is very primitive (e.g. does not support viewing history)
- Overleaf has paid sever-side integration with GitHub.

### Documentation
- BusyTex has almost no documentation besides this file
- Overleaf has extensive documentation, including great https://www.overleaf.com/learn resource that has beginner and expert documentation about LaTeX itself.

### Project storage
- BusyTex does not have its own server-side storage and fully relies on GitHub integration as project storage as well.
- Overleaf provides server-side project storage and does not require any third-party services for basic work.

### Project collaboration
- BusyTex support collaboration only via GitHub. BusyTex does not support multiple users editing the document or online collaboration.
- Overleaf supports multiple users editing the document and also supports online collaboration. Overleaf supports GitHub integration as a paid feature.

### Project compilation
- BusyTex compiles projects locally on your machine, in the browser. This requires a good internet connection for first-time downloading ~100 megabytes of binaries / TexLive distribution, CPU resources, ~100 megabytes of RAM. Speed of compilation is limited by your CPU speed / efficiency of WASM support in browser.
- Overleaf compiles projects server-side. This does not require and significant local resources. This normally means faster compilation times than BusyTex, except for conference deadline times, during these peak load times, compilation may take indefinitely longer or fail.

### Work recovery
- BusyTex currently does not support any recovery of un-committed work (e.g. after browser crash or closing the browser unintentionally).
- Overleaf does not have this problem because edits are sent to the server in real-time. The only problem for recovery may be during internet connection problems.

### Open source
- BusyTex is open source and lives at https://github.com/busytex/busytex and https://github.com/busytex/busyide
- Overleaf is open source as well and lives at https://github.com/overleaf/overleaf 

### Hackability
- BusyTex is highly hackable, it does not use any UI-frameworks
- Overleaf is also hackable but its codebase is more complex

### Hosting
- BusyTex is completely client-side software and runs on your machine. Besides using BusyTex at https://busytex.github.io, There are multiple options of hosting your own copy of BusyTex.
- Overleaf requires running server-side services. Besides using Overleaf at https://overleaf.com, one can run your own free copy as a Docker image. Overleaf provides paid service for supporting on-premises version: https://www.overleaf.com/for/enterprises.

### BusyTex architecture
1. TexLive programs compiled to WASM
2. TexLive data packages
3. Busybox programs compiled to WASM
4. IDE shell

<hr />
### Supported URIs
- https://busytex.github.io/#https://github.com/vadimkantorov/busyidetest/archive/refs/heads/master.zip
- https://busytex.github.io/#https://github.com/vadimkantorov/busyidetest/tree/master/
- https://busytex.github.io/#https://github.com/vadimkantorov/busyidetest
- https://busytex.github.io/#https://gist.github.com/vadimkantorov/43590508854c6e1dac58bcee8d940a8d
- https://busytex.github.io/#https://arxiv.org/abs/1808.00158
- https://busytex.github.io/#data:application/tar+gzip;base64,H4sIAAAAAAAAA+1TS2/TQBDO2b9iLpVACsE2SYx641GBRBAVRKgSRmjsHSerrHetfeShqP+dieuGplWPKYfmu6xnd+abbx62hKKm171jImZkWdaejPtn+50M42GSDtPhmP2SJE5HPRgdVVWH4DxagN6Kij/BkX20iKcQ8/SwN/P/fvHu49eLgaf1EXLsBjwejx+bf5Jko3/zz1KefzqKhz2Ij6DlAZ75/HNhylCT9qVC534lSeN/b9F6WSq6jvKCZlJvb32uoyj30ivavg9uM6U1e2Dwc2O3P1HIGr6g9saaJd8L9LSdGoEbNmpcUBvIBI5KL42+pfimldSc6sAE6QChVJKTOinoldFqAxOc0hWQkJwDUAsoTd1IRXYAP0LTGOtJQBV0y+/Owc3REvMw46LPbIaJK2tq+CT951D0oQluDt509gAeqtvr6hQZpW4cwFTA1xO5JGismVmsHfAqceNQsdZOmgDJHeFIJ/VMEdCayuCxUDSAD8Faro+di6DFzndPxLrP4Yq43D4UsuDf8m1b8FosZSOqet2HReNoNZfl/C6R27ehUegrY2tuw0TqwAErdPWbFF4U1qx4zzspu1K4NE+Oo/qgjaDDF2189/pyAJdkS84E+VkU4Vl7v6t0txtRdGhDyt2875KTFne26X8v/wknnHDCM8ZfeL5NggAMAAA=

### Planned modes of operation
2. local run with serve.py (mount FS / terminal?)
3. packaging of everything into one large HTML file to run from file://

### TODO
0. https://github.com/GoogleChromeLabs/browser-fs-access
0. https://developpaper.com/monaco-uses-vscode-related-syntax-to-highlight-on-the-browser/
0. view log + search (bad rename)
0. https://stackoverflow.com/questions/34632839/checkbox-marked-with-click-in-link
0. https://github.com/Darkseal/CORSflare
0. https://gist.github.com/jimmywarting/ac1be6ea0297c16c477e17f8fbe51347
0. https://github.com/wasmerio/wasmer-js/blob/master/packages/wasm-terminal/src/wasm-shell/wasm-shell.ts, https://webassembly.sh
0. https://chromium.googlesource.com/apps/libapps/+/master/hterm/
0. https://github.com/Microsoft/monaco-editor/issues/44 https://stackoverflow.com/questions/57246356/how-to-highlight-merge-conflict-blocks-in-monaco-editor-like-vscode https://github.com/Symbolk/IntelliMerge-UI
0. https://stackoverflow.com/questions/4628544/how-to-detect-when-cancel-is-clicked-on-file-input https://stackoverflow.com/questions/34855400/cancel-event-on-input-type-file
0. https://github.com/microsoft/monaco-editor/issues/102
0. https://github.com/ochachacha/ps-wasm https://codepen.io/sivadass/details/XZEVmM https://stackoverflow.com/questions/33063213/pdf-js-with-text-selection/43345096 https://github.com/mozilla/pdf.js/issues/11359#issuecomment-558841393 https://github.com/allefeld/atom-pdfjs-viewer
1. https://developers.cloudflare.com/workers/examples/cors-header-proxy, https://github.com/Zibri/cloudflare-cors-anywhere
2. Store file sha hashes in .git directory
8. Ctrl+V, command history
10. file tab auto-complete
11. https://github.com/ElektraInitiative/libelektra/issues/2873
13. do not download all artefacts, not just a single pdfpath/logpath -> move artefacts to /tmp
14. Typing is not shown until commands finished processing
15. Splitter: https://codepen.io/rstrahl/pen/eJZQej
5. Broken texpath
6. autosave
8. pseudo-shell quotes
9. renaming a current directory + needs a re-cd
4. GitHub links: github file, project: https://gist.github.com/btoone/2288960 https://github.com/go-jsonfile/jsonfiddle#usage-1
17. http://showdownjs.com/
18. support cors proxy + tar/tar.gz/gz/zip inputs (github tar.gz)
19. support single file mode from http
21. Versions file, preload all media in HTML
22. Merge binary files
23. .. + title is incorrect at ~
24. timer for auto-save https://stackoverflow.com/questions/5766263/run-settimeout-only-when-tab-is-active
26. selection is unchanged when going inside a directory
27. Disposing an opened model, do not close upon renaming
28. https://api.github.com/repos/busytex/busytex/git/trees/main?recursive=1
29. Unify ok/error + initial promp
30. pstoedit
31. dot and dotdot get unselected, because dirname does not match . or .. in the select
32. Do not close edited file when viewing directory or git
33. Better status: how many commits behind master (refresh button?). Check before push

```shell
# https://github.com/xloem/emterm
# https://github.com/tomoyukim/vscode-mermaid-editor
# https://github.com/koka-lang/madoko/blob/master/web/client/scripts/editor.js
# https://github.com/koka-lang/madoko/blob/master/web/client/scripts/merge.js
# rate limit error: documentation_url: "https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting"
# message: "API rate limit exceeded for 92.169.44.67. (But here's the good news: Authenticated requests get a higher rate limit. Check out the documentation for more details.)"
# https://github.com/emscripten-core/emscripten/blob/master/src/library_idbfs.js#L21
# http://www.levibotelho.com/development/commit-a-file-with-the-github-api/
# https://blog.jcoglan.com/2017/05/08/merging-with-diff3/
# https://github.com/ywangd/stash/blob/master/lib/git/gitutils.py
```

### Links

http://gitlet.maryrosecook.com/docs/gitlet.html

https://mincong.io/2018/04/28/git-index/

https://medium.com/hackernoon/understanding-git-index-4821a0765cf

https://stackoverflow.com/questions/25576415/what-is-the-precise-meaning-of-ours-and-theirs-in-git

https://nitaym.github.io/ourstheirs/

https://git-scm.com/book/en/v2/Git-Tools-Advanced-Merging


http://www.jpeek.com/articles/linuxmag/2007-06/

https://github.com/BlueMagnificent/monaco-tree

https://swimburger.net/blog/dotnet/how-to-deploy-aspnet-blazor-webassembly-to-github-pages

https://medium.com/codingtown/xterm-js-terminal-2b19ccd2a52

https://github.com/RangerMauve/xterm-js-shell

https://github.com/latexjs/latexjs/blob/master/latexjs/Dockerfile

https://github.com/latexjs/latexjs

https://github.com/emscripten-core/emscripten/issues/2040

https://git-scm.com/docs/gitrepository-layout

https://stackoverflow.com/questions/59983250/there-is-any-standalone-version-of-the-treeview-component-of-vscode

https://itnext.io/build-ffmpeg-webassembly-version-ffmpeg-js-part-3-ffmpeg-js-v0-1-0-transcoding-avi-to-mp4-f729e503a397

https://mozilla.github.io/pdf.js/examples/index.html#interactive-examples

https://github.com/AREA44/vscode-LaTeX-support

https://github.com/microsoft/monaco-languages

https://browsix.org/latex-demo-sync/

https://developer.github.com/v3/repos/contents/#create-or-update-file-contents

https://github.com/zrxiv/browserext/blob/master/backend.js

http://www.levibotelho.com/development/commit-a-file-with-the-github-api/

# https://blog.jcoglan.com/2017/03/22/myers-diff-in-linear-space-theory/
# http://www.xmailserver.org/xdiff-lib.html

// DevCore command database.
// Templates use §CURSOR§ to mark where the cursor should land after insertion.
// Only commands that make sense for a language are listed for that language;
// the popup only ever shows commands that exist for the current file's language.

const CURSOR_MARKER = '§CURSOR§';

const EXTENSION_TO_LANGUAGE = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.html': 'html',
  '.css': 'css',
  '.cpp': 'cpp',
  '.c': 'c',
  '.java': 'java',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.php': 'php',
  '.rb': 'ruby',
  '.sql': 'sql',
  '.sh': 'shell',
  '.json': 'json',
  '.md': 'markdown'
};

// Maps our internal language ids to Monaco's language ids.
const LANGUAGE_TO_MONACO_ID = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  html: 'html',
  css: 'css',
  cpp: 'cpp',
  c: 'c',
  java: 'java',
  csharp: 'csharp',
  go: 'go',
  rust: 'rust',
  php: 'php',
  ruby: 'ruby',
  sql: 'sql',
  shell: 'shell',
  json: 'json',
  markdown: 'markdown',
  plaintext: 'plaintext'
};

const LANGUAGE_DISPLAY_NAME = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  html: 'HTML',
  css: 'CSS',
  cpp: 'C++',
  c: 'C',
  java: 'Java',
  csharp: 'C#',
  go: 'Go',
  rust: 'Rust',
  php: 'PHP',
  ruby: 'Ruby',
  sql: 'SQL',
  shell: 'Shell',
  json: 'JSON',
  markdown: 'Markdown',
  plaintext: 'Plain Text'
};

const COMMANDS = {
  python: {
    function: 'def function_name():\n    §CURSOR§pass',
    variable: 'variable_name = §CURSOR§None',
    constant: 'CONSTANT_NAME = §CURSOR§None',
    class: 'class ClassName:\n    def __init__(self):\n        §CURSOR§pass',
    if: 'if §CURSOR§condition:\n    pass',
    else: 'else:\n    §CURSOR§pass',
    for: 'for item in §CURSOR§iterable:\n    pass',
    while: 'while §CURSOR§condition:\n    pass',
    return: 'return §CURSOR§value',
    import: 'import §CURSOR§module',
    export: "__all__ = [§CURSOR§'name']",
    comment: '# §CURSOR§comment',
    print: 'print(§CURSOR§value)',
    input: '§CURSOR§value = input()',
    try: 'try:\n    pass\nexcept §CURSOR§Exception as e:\n    pass',
    catch: 'except §CURSOR§Exception as e:\n    pass',
    async: 'async def function_name():\n    §CURSOR§pass',
    await: 'await §CURSOR§coroutine'
  },

  javascript: {
    function: 'function functionName() {\n    §CURSOR§\n}',
    variable: 'let variableName = §CURSOR§null;',
    constant: 'const CONSTANT_NAME = §CURSOR§null;',
    class: 'class ClassName {\n    constructor() {\n        §CURSOR§\n    }\n}',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for (let i = 0; i < §CURSOR§length; i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: "import { §CURSOR§module } from 'module';",
    export: 'export { §CURSOR§name };',
    comment: '// §CURSOR§comment',
    print: 'console.log(§CURSOR§value);',
    input: 'const §CURSOR§value = prompt();',
    try: 'try {\n    \n} catch (§CURSOR§error) {\n    \n}',
    catch: 'catch (§CURSOR§error) {\n    \n}',
    async: 'async function functionName() {\n    §CURSOR§\n}',
    await: 'await §CURSOR§promise;'
  },

  typescript: {
    function: 'function functionName(): void {\n    §CURSOR§\n}',
    variable: 'let variableName: any = §CURSOR§null;',
    constant: 'const CONSTANT_NAME: any = §CURSOR§null;',
    class: 'class ClassName {\n    constructor() {\n        §CURSOR§\n    }\n}',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for (let i = 0; i < §CURSOR§length; i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: "import { §CURSOR§module } from 'module';",
    export: 'export { §CURSOR§name };',
    comment: '// §CURSOR§comment',
    print: 'console.log(§CURSOR§value);',
    input: "const §CURSOR§value: string = prompt() ?? '';",
    try: 'try {\n    \n} catch (§CURSOR§error) {\n    \n}',
    catch: 'catch (§CURSOR§error) {\n    \n}',
    async: 'async function functionName(): Promise<void> {\n    §CURSOR§\n}',
    await: 'await §CURSOR§promise;'
  },

  cpp: {
    function: 'void functionName() {\n    §CURSOR§\n}',
    variable: 'int variableName = §CURSOR§0;',
    constant: 'const int CONSTANT_NAME = §CURSOR§0;',
    class: 'class ClassName {\npublic:\n    ClassName() {\n        §CURSOR§\n    }\n};',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for (int i = 0; i < §CURSOR§length; i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: '#include <§CURSOR§header>',
    export: 'extern §CURSOR§declaration;',
    comment: '// §CURSOR§comment',
    print: 'std::cout << §CURSOR§value << std::endl;',
    input: 'std::cin >> §CURSOR§value;',
    try: 'try {\n    \n} catch (§CURSOR§std::exception& e) {\n    \n}',
    catch: 'catch (§CURSOR§std::exception& e) {\n    \n}',
    async: 'std::async(std::launch::async, [§CURSOR§]() {\n    \n});',
    await: '§CURSOR§future.get();'
  },

  c: {
    function: 'void functionName() {\n    §CURSOR§\n}',
    variable: 'int variableName = §CURSOR§0;',
    constant: '#define CONSTANT_NAME §CURSOR§0',
    class: 'typedef struct {\n    §CURSOR§int placeholder;\n} StructName;',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for (int i = 0; i < §CURSOR§length; i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: '#include <§CURSOR§header.h>',
    export: 'extern §CURSOR§declaration;',
    comment: '// §CURSOR§comment',
    print: 'printf("§CURSOR§%d\\n", value);',
    input: 'scanf("%d", &§CURSOR§value);',
    try: '/* C has no try/catch — §CURSOR§handle the error code manually */',
    catch: '/* C has no catch — §CURSOR§check the return value or errno */',
    async: '/* C has no built-in async — §CURSOR§use pthreads or a library */',
    await: '/* C has no await — §CURSOR§join the thread manually */'
  },

  java: {
    function: 'void functionName() {\n    §CURSOR§\n}',
    variable: 'int variableName = §CURSOR§0;',
    constant: 'final int CONSTANT_NAME = §CURSOR§0;',
    class: 'public class ClassName {\n    public ClassName() {\n        §CURSOR§\n    }\n}',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for (int i = 0; i < §CURSOR§length; i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: 'import §CURSOR§package.Class;',
    export: '/* Java has no export keyword — §CURSOR§use the public modifier */',
    comment: '// §CURSOR§comment',
    print: 'System.out.println(§CURSOR§value);',
    input: '§CURSOR§Scanner scanner = new Scanner(System.in);',
    try: 'try {\n    \n} catch (§CURSOR§Exception e) {\n    \n}',
    catch: 'catch (§CURSOR§Exception e) {\n    \n}',
    async: 'CompletableFuture.runAsync(() -> {\n    §CURSOR§\n});',
    await: '§CURSOR§future.get();'
  },

  csharp: {
    function: 'void FunctionName() {\n    §CURSOR§\n}',
    variable: 'int variableName = §CURSOR§0;',
    constant: 'const int CONSTANT_NAME = §CURSOR§0;',
    class: 'public class ClassName {\n    public ClassName() {\n        §CURSOR§\n    }\n}',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for (int i = 0; i < §CURSOR§length; i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: 'using §CURSOR§Namespace;',
    export: '/* C# has no export keyword — §CURSOR§use the public modifier */',
    comment: '// §CURSOR§comment',
    print: 'Console.WriteLine(§CURSOR§value);',
    input: '§CURSOR§var value = Console.ReadLine();',
    try: 'try {\n    \n} catch (§CURSOR§Exception e) {\n    \n}',
    catch: 'catch (§CURSOR§Exception e) {\n    \n}',
    async: 'async Task FunctionNameAsync() {\n    §CURSOR§\n}',
    await: 'await §CURSOR§task;'
  },

  go: {
    function: 'func functionName() {\n    §CURSOR§\n}',
    variable: 'var variableName = §CURSOR§0',
    constant: 'const CONSTANT_NAME = §CURSOR§0',
    class: 'type StructName struct {\n    §CURSOR§Field int\n}',
    if: 'if §CURSOR§condition {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for i := 0; i < §CURSOR§length; i++ {\n    \n}',
    while: 'for §CURSOR§condition {\n    \n}',
    return: 'return §CURSOR§value',
    import: 'import "§CURSOR§package"',
    export: '/* Go exports via capitalized names — §CURSOR§rename to Capitalized */',
    comment: '// §CURSOR§comment',
    print: 'fmt.Println(§CURSOR§value)',
    input: 'fmt.Scanln(&§CURSOR§value)',
    try: '/* Go has no try/catch — §CURSOR§use error return values */',
    catch: 'if err != nil {\n    §CURSOR§\n}',
    async: 'go func() {\n    §CURSOR§\n}()',
    await: '§CURSOR§wg.Wait()'
  },

  rust: {
    function: 'fn function_name() {\n    §CURSOR§\n}',
    variable: 'let variable_name = §CURSOR§0;',
    constant: 'const CONSTANT_NAME: i32 = §CURSOR§0;',
    class: 'struct StructName {\n    §CURSOR§field: i32,\n}',
    if: 'if §CURSOR§condition {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for item in §CURSOR§iterable {\n    \n}',
    while: 'while §CURSOR§condition {\n    \n}',
    return: 'return §CURSOR§value;',
    import: 'use §CURSOR§module;',
    export: 'pub §CURSOR§struct StructName;',
    comment: '// §CURSOR§comment',
    print: 'println!("{}", §CURSOR§value);',
    input: 'std::io::stdin().read_line(&mut §CURSOR§input).unwrap();',
    try: 'match §CURSOR§result {\n    Ok(v) => {},\n    Err(e) => {},\n}',
    catch: 'Err(§CURSOR§e) => {}',
    async: 'async fn function_name() {\n    §CURSOR§\n}',
    await: '§CURSOR§future.await;'
  },

  php: {
    function: 'function functionName() {\n    §CURSOR§\n}',
    variable: '$variableName = §CURSOR§null;',
    constant: "define('CONSTANT_NAME', §CURSOR§null);",
    class: 'class ClassName {\n    public function __construct() {\n        §CURSOR§\n    }\n}',
    if: 'if (§CURSOR§condition) {\n    \n}',
    else: 'else {\n    §CURSOR§\n}',
    for: 'for ($i = 0; $i < §CURSOR§length; $i++) {\n    \n}',
    while: 'while (§CURSOR§condition) {\n    \n}',
    return: 'return §CURSOR§value;',
    import: "require '§CURSOR§file.php';",
    export: '/* PHP has no export keyword — §CURSOR§use public visibility or require */',
    comment: '// §CURSOR§comment',
    print: 'echo §CURSOR§value;',
    input: '$§CURSOR§value = readline();',
    try: 'try {\n    \n} catch (§CURSOR§Exception $e) {\n    \n}',
    catch: 'catch (§CURSOR§Exception $e) {\n    \n}',
    async: '/* PHP has no native async — §CURSOR§use a library like ReactPHP */',
    await: '/* PHP has no native await — §CURSOR§use a library like ReactPHP */'
  },

  ruby: {
    function: 'def function_name\n  §CURSOR§\nend',
    variable: 'variable_name = §CURSOR§nil',
    constant: 'CONSTANT_NAME = §CURSOR§nil',
    class: 'class ClassName\n  def initialize\n    §CURSOR§\n  end\nend',
    if: 'if §CURSOR§condition\n  \nend',
    else: 'else\n  §CURSOR§\nend',
    for: 'for item in §CURSOR§iterable\n  \nend',
    while: 'while §CURSOR§condition\n  \nend',
    return: 'return §CURSOR§value',
    import: "require '§CURSOR§module'",
    export: '# Ruby has no export keyword — §CURSOR§methods are public by default',
    comment: '# §CURSOR§comment',
    print: 'puts §CURSOR§value',
    input: '§CURSOR§value = gets.chomp',
    try: 'begin\n  \nrescue §CURSOR§StandardError => e\n  \nend',
    catch: 'rescue §CURSOR§StandardError => e',
    async: 'Thread.new do\n  §CURSOR§\nend',
    await: '§CURSOR§thread.join'
  },

  sql: {
    function: 'CREATE FUNCTION function_name()\nRETURNS §CURSOR§INT\nBEGIN\n    \nEND;',
    variable: 'DECLARE §CURSOR§variable_name INT;',
    constant: '-- §CURSOR§SQL has no constants — use a variable or config table',
    class: 'CREATE TABLE §CURSOR§table_name (\n    id INT PRIMARY KEY\n);',
    if: 'IF §CURSOR§condition THEN\n    \nEND IF;',
    else: 'ELSE\n    §CURSOR§\nEND IF;',
    for: 'FOR §CURSOR§i IN 1..10 LOOP\n    \nEND LOOP;',
    while: 'WHILE §CURSOR§condition DO\n    \nEND WHILE;',
    return: 'RETURN §CURSOR§value;',
    import: '-- §CURSOR§SQL has no import — use USE database; or ATTACH',
    export: '-- §CURSOR§SQL has no export — use SELECT ... INTO OUTFILE',
    comment: '-- §CURSOR§comment',
    print: 'SELECT §CURSOR§value;',
    input: '-- §CURSOR§SQL has no input — bind a parameter instead',
    try: 'BEGIN TRY\n    \nEND TRY\nBEGIN CATCH\n    §CURSOR§\nEND CATCH;',
    catch: 'BEGIN CATCH\n    §CURSOR§\nEND CATCH;',
    async: '-- §CURSOR§SQL has no async — queries run synchronously',
    await: '-- §CURSOR§SQL has no await — queries run synchronously'
  },

  shell: {
    function: 'function_name() {\n    §CURSOR§\n}',
    variable: 'variable_name=§CURSOR§value',
    constant: 'readonly CONSTANT_NAME=§CURSOR§value',
    class: '# §CURSOR§Shell has no classes — use functions and namespacing',
    if: 'if [ §CURSOR§condition ]; then\n    \nfi',
    else: 'else\n    §CURSOR§\nfi',
    for: 'for item in §CURSOR§list; do\n    \ndone',
    while: 'while [ §CURSOR§condition ]; do\n    \ndone',
    return: 'return §CURSOR§0',
    import: 'source §CURSOR§file.sh',
    export: 'export §CURSOR§VARIABLE_NAME=value',
    comment: '# §CURSOR§comment',
    print: 'echo §CURSOR§value',
    input: 'read §CURSOR§value',
    try: 'if §CURSOR§command; then\n    \nelse\n    \nfi',
    catch: '|| { §CURSOR§echo "error"; }',
    async: '§CURSOR§command &',
    await: 'wait §CURSOR§'
  },

  html: {
    function: '<script>\nfunction functionName() {\n    §CURSOR§\n}\n</script>',
    class: '<div class="§CURSOR§class-name">\n    \n</div>',
    import: '<link rel="stylesheet" href="§CURSOR§style.css">',
    comment: '<!-- §CURSOR§comment -->'
  },

  css: {
    variable: '--§CURSOR§variable-name: value;',
    class: '.§CURSOR§class-name {\n    \n}',
    if: '@media (§CURSOR§condition) {\n    \n}',
    import: "@import url('§CURSOR§style.css');",
    comment: '/* §CURSOR§comment */'
  },

  json: {
    variable: '"§CURSOR§key": "value"',
    class: '"§CURSOR§objectName": {\n    \n}'
  },

  markdown: {
    class: '## §CURSOR§Heading',
    for: '- §CURSOR§list item',
    import: '[§CURSOR§link text](url)',
    comment: '<!-- §CURSOR§comment -->'
  }
};

function getLanguageForFile(filePath) {
  const match = /\.[^./\\]+$/.exec(filePath || '');
  const ext = match ? match[0].toLowerCase() : '';
  return EXTENSION_TO_LANGUAGE[ext] || 'plaintext';
}

function getCommandsForLanguage(language) {
  return COMMANDS[language] || {};
}

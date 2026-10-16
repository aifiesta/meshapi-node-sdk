// Prints the SDK's typed surface as JSON for the contract drift gate.
// Models come from the built declarations (dist/index.d.ts); request params come
// from the resource sources, since declarations carry no URL paths.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RESOURCES = join(ROOT, "src", "resources");
const API_VERSION_HEADER = "X-Mesh-Version";

const HTTP_VERBS = new Map(Object.entries({
  get: "GET", post: "POST", put: "PUT", patch: "PATCH", delete: "DELETE",
  getBytes: "GET", postBytes: "POST", postMultipart: "POST", stream: "POST",
}));
const SSE_HELPER = "makeLazySSEIterable";

// SDK type name -> spec component name, where the two differ.
const SPEC_NAMES = new Map(Object.entries({
  ModelInfo: "ModelOut",
  ChatCompletionParams: "ChatCompletionRequest",
  ChatMessage: "Message",
  ChatCompletionChoice: "Choice",
  CompareParams: "CompareRequest",
  CreateBatchParams: "CreateBatchRequest",
  CreateTemplateParams: "CreateTemplateRequest",
  UpdateTemplateParams: "UpdateTemplateRequest",
  EmbeddingsParams: "EmbeddingsRequest",
  ImageGenerationParams: "ImageGenerationRequest",
  ModerationParams: "ModerationRequest",
  ResponsesParams: "ResponsesRequest",
  RouterSelectParams: "RouterSelectRequest",
  SpeechParams: "SpeechRequest",
  VideoGenerationParams: "VideoGenerationRequest",
  WebSearchParams: "WebSearchRequest",
  TranscriptionParams: "Body_create_transcription",
  AudioTranslationsParams: "Body_create_translation",
  TranscriptionTranslateParams: "Body_create_transcription_translate",
  RagFileStatus: "FileStatusResponse",
  RagFileListResponse: "FileListResponse",
}));

const snake = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const variants = (s: string): string[] => [...new Set([s, snake(s)])];

function propertyNames(type: ts.Type, checker: ts.TypeChecker, seen = new Set<ts.Type>()): string[] {
  if (seen.has(type)) return [];
  seen.add(type);
  if (type.isUnionOrIntersection()) {
    return type.types.flatMap((t) => propertyNames(t, checker, seen));
  }
  return checker.getPropertiesOfType(type).map((p) => p.getName());
}

function modelFields(): string[][] {
  const entry = join(ROOT, "dist", "index.d.ts");
  const program = ts.createProgram([entry], { skipLibCheck: true, noEmit: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (!source) throw new Error(`cannot read ${entry}`);
  const rows = new Set<string>();
  const add = (owner: string, field: string) => rows.add(JSON.stringify([owner, field]));

  const modules = checker.getSymbolAtLocation(source);
  for (const sym of modules ? checker.getExportsOfModule(modules) : []) {
    const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
    if (!(resolved.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))) continue;
    const name = sym.getName();
    const type = checker.getDeclaredTypeOfSymbol(resolved);
    const mapped = SPEC_NAMES.get(name);
    const owners = mapped ? [name, mapped] : [name];
    for (const field of propertyNames(type, checker)) {
      for (const owner of owners) for (const f of variants(field)) add(owner, f);
    }
  }
  return [...rows].sort().map((r) => JSON.parse(r) as string[]);
}

function pathFromLiteral(node: ts.Expression, fnParams: string[]): string | null {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text;
    for (const span of node.templateSpans) {
      // A span not preceded by "/" is a query string or suffix, not a path segment.
      if (!out.endsWith("/")) break;
      let ident = firstIdentifier(span.expression);
      // A local alias (e.g. an encoded copy) stands for the function's own id argument.
      if (!fnParams.includes(ident) && fnParams[0]) ident = fnParams[0];
      out += `{${ident}}` + span.literal.text;
    }
    return out;
  }
  return null;
}

function firstIdentifier(node: ts.Node): string {
  let found = "param";
  const visit = (n: ts.Node) => {
    if (found !== "param") return;
    if (ts.isIdentifier(n) && n.text !== "encodeURIComponent") { found = n.text; return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function calleeName(call: ts.CallExpression): string | null {
  const fn = call.expression;
  if (ts.isPropertyAccessExpression(fn)) return fn.name.text;
  if (ts.isIdentifier(fn)) return fn.text;
  return null;
}

function params(): string[] {
  const files = readdirSync(RESOURCES).filter((f) => f.endsWith(".ts")).sort().map((f) => join(RESOURCES, f));
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true, noEmit: true,
  };
  const program = ts.createProgram(files, options);
  const checker = program.getTypeChecker();
  const found = new Set<string>();

  for (const file of files) {
    const source = program.getSourceFile(file)!;
    const visitFn = (fn: ts.FunctionLikeDeclaration) => {
      if (!fn.body) return;
      const methods = new Set<string>();
      const paths = new Set<string>();
      const names = new Set<string>();
      const pathArgs = fn.parameters
        .map((p) => (ts.isIdentifier(p.name) ? p.name.text : ""))
        .filter((n) => n && !["opts", "params", "body"].includes(n));

      const scan = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          const callee = calleeName(n);
          const verb = callee ? HTTP_VERBS.get(callee) : undefined;
          if (verb && ts.isPropertyAccessExpression(n.expression)) methods.add(verb);
          if (callee === SSE_HELPER) methods.add("POST");
          if (callee === "set" || callee === "append") {
            const first = n.arguments[0];
            if (first && ts.isStringLiteralLike(first)) names.add(first.text);
          }
        }
        if (ts.isObjectLiteralExpression(n)) {
          for (const p of n.properties) {
            if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name))) names.add(p.name.text);
          }
        }
        if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) {
          names.add(n.argumentExpression.text);
        }
        if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
          const p = pathFromLiteral(n, pathArgs);
          if (p && /^\/v\d+\//.test(p)) paths.add(p.split("?")[0]!.replace(/\/$/, ""));
        }
        ts.forEachChild(n, scan);
      };
      scan(fn.body);
      if (methods.size === 0 || paths.size === 0) return;

      for (const p of fn.parameters) {
        if (!ts.isIdentifier(p.name)) continue;
        if (["opts", "params", "body"].includes(p.name.text)) {
          // Request/query models passed as `params` expose their fields as request params.
          if (p.name.text === "params") {
            for (const f of propertyNames(checker.getTypeAtLocation(p), checker)) names.add(f);
          }
          continue;
        }
        names.add(p.name.text);
      }

      for (const path of paths) {
        for (const m of methods) {
          const scope = `${m} ${path}`;
          const all = new Set([...names, API_VERSION_HEADER]);
          for (const ph of path.matchAll(/\{(\w+)\}/g)) all.add(ph[1]!);
          for (const n of all) for (const v of n === API_VERSION_HEADER ? [n] : variants(n)) found.add(`${scope}:${v}`);
          // Placeholders are emitted under both the code identifier and its snake_case form.
          for (const ph of path.matchAll(/\{(\w+)\}/g)) {
            found.add(`${scope.replace(`{${ph[1]}}`, `{${snake(ph[1]!)}}`)}:${snake(ph[1]!)}`);
          }
          const snakePath = path.replace(/\{(\w+)\}/g, (_, g: string) => `{${snake(g)}}`);
          if (snakePath !== path) for (const n of all) for (const v of n === API_VERSION_HEADER ? [n] : variants(n)) found.add(`${m} ${snakePath}:${v}`);
        }
      }
    };
    const walk = (n: ts.Node) => {
      if (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
        visitFn(n as ts.FunctionLikeDeclaration);
      }
      ts.forEachChild(n, walk);
    };
    walk(source);
  }
  return [...found].sort();
}

const version = readFileSync(join(ROOT, ".meshapi-spec-version"), "utf8").trim();
const surface = { schema_version: "1", spec_version: version, model_fields: modelFields(), params: params() };
process.stdout.write(JSON.stringify(surface, null, 1) + "\n");

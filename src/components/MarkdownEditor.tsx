import { useCallback, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code, Minus, Undo, Redo, Upload, FileText,
  Link as LinkIcon, Eye, Edit2, AlignLeft
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

// ─── TipTap → Markdown serializer (subset) ────────────────────────────────────
function tiptapToMarkdown(json: any): string {
  if (!json?.content) return "";
  return json.content.map(nodeToMd).join("\n");
}

function nodeToMd(node: any): string {
  switch (node.type) {
    case "heading": {
      const level = node.attrs?.level ?? 1;
      const prefix = "#".repeat(level) + " ";
      return prefix + inlineToMd(node.content) + "\n";
    }
    case "paragraph":
      return inlineToMd(node.content) + "\n";
    case "bulletList":
      return (node.content || []).map((li: any) => "- " + listItemToMd(li)).join("\n") + "\n";
    case "orderedList":
      return (node.content || []).map((li: any, i: number) => `${i + 1}. ` + listItemToMd(li)).join("\n") + "\n";
    case "blockquote":
      return (node.content || []).map((n: any) => "> " + nodeToMd(n)).join("") + "\n";
    case "codeBlock":
      return "```\n" + (node.content?.[0]?.text ?? "") + "\n```\n";
    case "horizontalRule":
      return "---\n";
    case "hardBreak":
      return "\n";
    default:
      return "";
  }
}

function listItemToMd(li: any): string {
  return (li.content || []).map((n: any) => inlineToMd(n.content)).join("") + "\n";
}

function inlineToMd(nodes: any[] = []): string {
  return nodes.map((n) => {
    if (n.type === "text") {
      let t = n.text || "";
      const marks: string[] = (n.marks || []).map((m: any) => m.type);
      if (marks.includes("bold")) t = `**${t}**`;
      if (marks.includes("italic")) t = `*${t}*`;
      if (marks.includes("underline")) t = `<u>${t}</u>`;
      if (marks.includes("strike")) t = `~~${t}~~`;
      if (marks.includes("code")) t = `\`${t}\``;
      const linkMark = (n.marks || []).find((m: any) => m.type === "link");
      if (linkMark) t = `[${t}](${linkMark.attrs?.href ?? ""})`;
      return t;
    }
    return "";
  }).join("");
}

// ─── Markdown → TipTap JSON (reuse prose HTML) ───────────────────────────────
// We just set the content as HTML string via the editor commands.
// TipTap is used as the primary editor; markdown is derived on-the-fly.

// ─── Component ────────────────────────────────────────────────────────────────
interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function MarkdownEditor({ value, onChange, placeholder = "Write your policy content…", minHeight = "320px" }: MarkdownEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: {}, heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "underline text-primary" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: markdownToHtml(value),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      onChange(tiptapToMarkdown(json));
    },
    editorProps: {
      attributes: {
        class: "outline-none prose prose-sm max-w-none text-foreground px-4 py-3 min-h-[inherit]",
      },
    },
  });

  // ── Document import logic ──────────────────────────────────────────────────
  const handleFileImport = useCallback(async (file: File) => {
    setImporting(true);
    try {
      let text = "";
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "txt" || ext === "md") {
        text = await file.text();
      } else if (ext === "pdf") {
        text = await extractPdfText(file);
      } else if (ext === "docx") {
        text = await extractDocxText(file);
      } else {
        toast.error("Unsupported format. Use .txt, .md, .pdf, or .docx");
        return;
      }

      if (!text.trim()) {
        toast.error("No readable text found in this document.");
        return;
      }

      // Insert at current position (or replace if editor is empty)
      if (editor) {
        const currentMd = tiptapToMarkdown(editor.getJSON()).trim();
        if (currentMd === "") {
          editor.commands.setContent(markdownToHtml(text));
        } else {
          // Append after current content
          editor.commands.setContent(markdownToHtml(currentMd + "\n\n---\n\n" + text));
        }
        onChange(tiptapToMarkdown(editor.getJSON()));
        toast.success(`Imported "${file.name}" successfully`);
      }
    } catch (err: any) {
      toast.error("Failed to read document: " + (err?.message || "Unknown error"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [editor, onChange]);

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileImport(file);
  };

  // ── Toolbar helpers ────────────────────────────────────────────────────────
  const ToolbarBtn = ({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-muted",
        active && "bg-primary/10 text-primary"
      )}
    >
      {children}
    </button>
  );

  if (!editor) return null;

  return (
    <div className="rounded-xl border overflow-hidden bg-background">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30">
        {/* Format */}
        <ToolbarBtn title="Bold (⌘B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Italic (⌘I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Underline (⌘U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Inline Code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Headings */}
        <ToolbarBtn title="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Lists */}
        <ToolbarBtn title="Bullet List" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered List" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="h-3.5 w-3.5" />
        </ToolbarBtn>

        <div className="w-px h-5 bg-border mx-1" />

        {/* History */}
        <ToolbarBtn title="Undo (⌘Z)" onClick={() => editor.chain().focus().undo().run()}>
          <Undo className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Redo (⌘⇧Z)" onClick={() => editor.chain().focus().redo().run()}>
          <Redo className="h-3.5 w-3.5" />
        </ToolbarBtn>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Import document */}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          className="hidden"
          onChange={onFilePick}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-lg text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {importing ? "Importing…" : "Import doc"}
        </Button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* View toggle */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-lg text-xs gap-1.5"
          onClick={() => setMode(mode === "write" ? "preview" : "write")}
        >
          {mode === "write" ? <Eye className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
          {mode === "write" ? "Preview" : "Edit"}
        </Button>
      </div>

      {/* ── Editor / Preview ─────────────────────────────────────────────── */}
      <div style={{ minHeight }}>
        {mode === "write" ? (
          <EditorContent editor={editor} style={{ minHeight }} />
        ) : (
          <div className="px-4 py-3 prose prose-sm max-w-none text-foreground overflow-y-auto" style={{ minHeight }}>
            {value.trim() ? (
              <ReactMarkdown>{value}</ReactMarkdown>
            ) : (
              <p className="text-muted-foreground italic">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-muted/20 text-[10px] text-muted-foreground">
        <AlignLeft className="h-3 w-3" />
        <span>{value.split(/\s+/).filter(Boolean).length} words</span>
        <span>·</span>
        <span>{value.length} chars</span>
        <span className="ml-auto flex items-center gap-1">
          <FileText className="h-3 w-3" />
          Import: .txt .md .pdf .docx
        </span>
      </div>
    </div>
  );
}

// ─── PDF text extraction ──────────────────────────────────────────────────────
async function extractPdfText(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  // @ts-ignore
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${(await import("pdfjs-dist")).version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n\n");
}

// ─── DOCX text extraction ─────────────────────────────────────────────────────
async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// ─── Simple Markdown → HTML for TipTap initialisation ────────────────────────
function markdownToHtml(md: string): string {
  if (!md.trim()) return "<p></p>";

  let html = md
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold + italic combos
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<s>$1</s>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Inline links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Horizontal rule
    .replace(/^---$/gm, "<hr>")
    // Bullet lists (simple, non-nested)
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Block quotes
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    // Code blocks
    .replace(/```[\s\S]*?```/g, (match) => {
      const code = match.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
      return `<pre><code>${code}</code></pre>`;
    })
    // Paragraphs (double newlines)
    .replace(/\n{2,}/g, "</p><p>")
    // Single newlines within paragraphs
    .replace(/\n/g, "<br>");

  // Wrap lists
  html = html.replace(/(<li>.*?<\/li>)+/gs, "<ul>$&</ul>");

  // Wrap in paragraph if not starting with a block element
  if (!html.match(/^<(h[1-6]|ul|ol|blockquote|pre|hr)/)) {
    html = `<p>${html}</p>`;
  }

  return html;
}
